import express from "express"
import http from "node:http"
import {Server} from "socket.io"

const app = express();
const server = http.createServer(app);
const io = new Server(server);
import path from 'path';

const users = {};


app.use(express.urlencoded({extended:true}));
app.use(express.static("public"));
app.set("view engine","ejs")

io.on("connection", (socket) => {
  console.log("👤 User connected:", socket.id);

  socket.on("chatconnect", (username) => {
    users[username] = socket.id;
    socket.username = username;
    io.emit("chatconnect", users);
  });

  socket.on("offer", ({ from, to, offer }) => {
    const target = users[to];
    if (target) {
      io.to(target).emit("offer", { from, offer });
    }
  });

  socket.on("answer", ({ from, to, answer }) => {
    const target = users[to];
    if (target) {
      io.to(target).emit("answer", { from, answer });
    }
  });

  socket.on("icecandidate", ({ to, candidate }) => {
    const target = users[to];
    if (target) {
      io.to(target).emit("icecandidate", { candidate });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete users[socket.username];
      io.emit("chatconnect", users);
    }
  });
});
app.get("/",(req,res)=>{
   res.render("index")
})
server.listen(3000, () => {
  console.log("🚀 Server running on http://localhost:3000");
});