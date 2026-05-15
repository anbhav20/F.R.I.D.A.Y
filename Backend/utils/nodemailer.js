import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendEmail = async (to, subject, html) => {
  try {
    const data = await resend.emails.send({
      from: 'F.R.I.D.A.Y <onboarding@resend.dev>', // pehle ye use karo
      to,
      subject,
      html,
    });
    return data;
  } catch (error) {
    console.error("Failed to send email:", error.message);
    throw error;
  }
};