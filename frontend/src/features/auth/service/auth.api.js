import {api} from "../../api"
export const register =async(username, email, password)=>{

    const res = await api.post("/register", {username, email, password})
    return res.data
}

export const login = async (email, password)=>{
    const res = await api.post("/login", {email, password})
    return res.data
}

export const getMe = async()=>{
    const res = await api.get("/me");
    return res.data
}

export const logout = async()=>{
    await api.post("/logout")
}
