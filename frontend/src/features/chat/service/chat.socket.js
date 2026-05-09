import { io } from "socket.io-client";

export const initializeSocketConnection = () => {
    const socket = io(import.meta.env.VITE_SERVER_URI,{
        withCredentials:true
    });

    socket.on("connect",()=>{
        console.log("connected to socket.IO server")
    })
};