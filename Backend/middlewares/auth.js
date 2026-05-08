import jwt from 'jsonwebtoken'
export const authenticate = async(req, res, next) =>{
    const token = req.cookies.token

    if(!token){
        return res.status(401).json({
            message:"Unauthorized, please login to access this resource.",
            sucess:false
        })
     }    
     try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)
        req.user = decoded
        next()
     } catch (error) {
        res.status(401).json({
            message:"Something went wrong. please try again later."
        })
     }  
    
    }