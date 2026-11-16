const axios = require('axios');
const crypto = require('crypto');

class MpesaService {
    constructor() {
        this.env = process.env.MPESA_ENV || 'sandbox';
        // Fixed: Use correct environment variable name
        this.key = process.env.MPESA_CONSUMER_KEY;
        this.secret = process.env.MPESA_SECRET;
        this.shortcode = process.env.MPESA_SHORTCODE;
        this.passkey = process.env.MPESA_PASSKEY;
        this.callbackUrl = process.env.MPESA_CALLBACK_URL;
        
        if (this.env === 'sandbox') {
            this.baseUrl = 'https://sandbox.safaricom.co.ke';
        } else {
            this.baseUrl = 'https://api.safaricom.co.ke';
        }

        // Validate Configuration
        if (!this.key || !this.secret || !this.shortcode || !this.passkey) {
            console.error('❌ CRITICAL: Missing M-Pesa credentials in .env file.');
        }
    }

    // Get Access Token
    async getAccessToken() {
        const auth = Buffer.from(`${this.key}:${this.secret}`).toString('base64');
        
        try {
            const response = await axios.get(
                `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
                {
                    headers: {
                        Authorization: `Basic ${auth}`
                    }
                }
            );
            return response.data.access_token;
        } catch (error) {
            console.error('❌ Error getting access token:', error.response?.data || error.message);
            throw new Error('Failed to authenticate with M-Pesa. Check Consumer Key/Secret.');
        }
    }

    // Generate Password (STK Push requires this)
    generatePassword(timestamp) {
        const data = `${this.shortcode}${this.passkey}${timestamp}`;
        return crypto.createHash('sha256').update(data).digest('base64');
    }

    // Initiate STK Push
    async initiateSTKPush(phoneNumber, amount, accountReference, transactionDesc) {
        try {
            // 1. Validate Inputs
            if (!this.shortcode) {
                throw new Error('Party B (Shortcode) is missing. Check .env file.');
            }
            if (!phoneNumber) {
                throw new Error('Party A (Phone Number) is missing.');
            }

            const accessToken = await this.getAccessToken();
            const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
            const password = this.generatePassword(timestamp);
            
            // 2. Format Phone Number (Party A)
            // Remove +, replace 0 with 254. Must start with 254.
            let formattedPhone = phoneNumber.replace(/^0/, '254').replace(/^\+254/, '254');
            
            if (!formattedPhone.startsWith('254') || formattedPhone.length !== 12) {
                throw new Error('Invalid phone number format. Must be a valid Kenyan number (e.g., 254712345678).');
            }

            // 3. Construct Request
            // Party A = User's Phone (formattedPhone)
            // Party B = Your Shortcode (this.shortcode)
            const request = {
                BusinessShortCode: this.shortcode,
                Password: password,
                Timestamp: timestamp,
                TransactionType: 'CustomerPayBillOnline',
                Amount: amount,
                PartyA: formattedPhone,       // User's Phone
                PartyB: this.shortcode,       // Your Paybill/Till Number
                PhoneNumber: formattedPhone,  // User's Phone
                CallBackURL: this.callbackUrl,
                AccountReference: accountReference,
                TransactionDesc: transactionDesc
            };

            const response = await axios.post(
                `${this.baseUrl}/mpesa/stkpush/v1/processrequest`,
                request,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data.ResponseCode === '0') {
                return {
                    success: true,
                    message: 'STK push sent successfully',
                    checkoutRequestId: response.data.CheckoutRequestID,
                    responseDescription: response.data.ResponseDescription
                };
            } else {
                return {
                    success: false,
                    error: response.data.ResponseDescription || 'Failed to initiate STK push'
                };
            }

        } catch (error) {
            console.error('❌ STK Push Error:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.errorMessage || error.message || 'Failed to initiate payment'
            };
        }
    }
}

module.exports = new MpesaService();