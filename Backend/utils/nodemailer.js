import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
    service: "gmail",
   auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS, // app password
  },
})

transporter.verify().then(() => {
    console.log("Ready to send emails.")
}).catch((err) => {
    console.error("Email transporter error:", err.message)
})

export const sendEmail = async (to, subject, html, text) => {
    try {
        const mailOptions = {
            from: `"Perplexity" <${process.env.EMAIL_USER}>`,  
            to,
            subject,
            html,
            text
        }
        const details = await transporter.sendMail(mailOptions)
        return details
    } catch (error) {
        console.error("Failed to send email:", error.message)
        throw error
    }
}