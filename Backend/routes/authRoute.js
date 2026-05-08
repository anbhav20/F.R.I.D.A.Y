import express from 'express'
import { login, register, getMe, verifyEmail, resendVerification } from '../controllers/authcontroller.js'
import { authenticate } from '../middlewares/auth.js'
import rateLimit from 'express-rate-limit'

// Apply rate limiting to login and register routes
const authlimit = rateLimit({
    windowMs: 15*60*1000, // 15 minutes
    max:10,
    message:{message:"Too many attempts. Please try again later.", success:false}
})
const resendlimit = rateLimit({
    windowMs:60*60*1000, //1 hr
    max:4,
    message:{message:"Too many resend attempts.please try again later", success:false}
})

export const authrouter =  express.Router()

authrouter.post('/register', authlimit, register)
authrouter.post('/login',authlimit, login)
authrouter.get('/verify-email', verifyEmail)
authrouter.post("/resend-verification",resendlimit, resendVerification);
authrouter.get('/me', authenticate, getMe)