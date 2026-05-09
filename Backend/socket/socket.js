import {Server} from "socket.io"

let io;

export const initSocket=(httpServer)=>{
    io = new Server(httpServer,{
        cors:{
            origin:process.env.CLIENT_URL,
            credentials:true
        }
    })
    console.log("socket  io server is runing")
    io.on("connection", (socket)=>{
        console.log("A user connected"+ socket.id)
    })
}

export const getId=()=>{
    if(!io){
        throw new Error("io isn't initialized")
    }
    return io
}