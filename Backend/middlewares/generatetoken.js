import jwt from "jsonwebtoken";

export const generateAccessToken =  (user) => {
  const token =  jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "10m",
  });

  return token;
};

export const generateRefreshToken =  (user) => {
  const Refreshtoken = jwt.sign(
    {
      id: user._id,
    },
    process.env.REFRESH_TOKEN,
    { expiresIn: "30d" },
  );
  return Refreshtoken;
};

export  const generateEmailToken=(user)=>{
  const emailtoken = jwt.sign({email:user.email}, process.env.EMAIL_SECRET);
  return emailtoken
}
