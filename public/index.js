const socket = io();

const adduser = document.getElementById("adduser");
const inp = document.getElementById("inp");
const client = document.getElementById("client");
const you = document.getElementById("you");

let localstreams = null;
let naam = "";
let peerconn = null;
let targetUser = null;
const pendingCandidates = [];

// 1. Get user media
async function videoon() {
  try {
    localstreams = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    you.srcObject = localstreams;
    console.log("🎥 Local stream acquired.");
  } catch (err) {
    console.error("❌ Error getting media:", err);
    alert("Camera/mic access required.");
  }
}
videoon();

// 2. Create peer connection
const createPeerConnection = () => {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });

  // Add local tracks
  if (localstreams) {
    localstreams.getTracks().forEach((track) => {
      pc.addTrack(track, localstreams);
    });
  }

  // Handle remote tracks
  pc.ontrack = (event) => {
    let remoteStream = event.streams[0];
    const remoteTrack = event.track;

    if (!remoteStream) {
      console.warn("⚠️ No stream in event.streams. Creating manually.");
      remoteStream = new MediaStream();
      remoteStream.addTrack(remoteTrack);
    }

    const trySetStream = () => {
      if (remoteTrack.readyState === "live" && !remoteTrack.muted) {
        console.log("📽️ Setting srcObject to remote stream.");
        client.srcObject = remoteStream;

        client.autoplay = true;
        client.playsInline = true;

        client.onloadedmetadata = () => {
          client.play().then(() => {
            console.log("▶️ Remote video playing.");
          }).catch((err) => {
            console.warn("⚠️ Autoplay blocked:", err);
          });
        };
      } else {
        console.log(
          "⏳ Track not ready yet. Muted:",
          remoteTrack.muted,
          "ReadyState:",
          remoteTrack.readyState
        );
      }
    };

    remoteTrack.addEventListener("unmute", () => {
      console.log("📽️ Track unmuted. Setting srcObject.");
      trySetStream();
    });

    trySetStream();
  };

  // Send ICE candidates
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit("icecandidate", {
        to: targetUser,
        candidate: event.candidate,
      });
    }
  };

  return pc;
};

// 3. Join chat
adduser.addEventListener("click", () => {
  naam = inp.value.trim();
  if (!naam) return alert("Enter your name");
  socket.emit("chatconnect", naam);
});

// 4. Update user list
socket.on("chatconnect", (allusers) => {
  const list = document.getElementById("userlist");
  list.innerHTML = "";

  for (const user in allusers) {
    if (user !== naam) {
      const li = document.createElement("li");
      li.textContent = user;

      const button = document.createElement("button");
      button.textContent = "Call";
      button.addEventListener("click", async () => {
        targetUser = user;
        peerconn = createPeerConnection();

        const offer = await peerconn.createOffer();
        await peerconn.setLocalDescription(offer);

        socket.emit("offer", {
          from: naam,
          to: user,
          offer: peerconn.localDescription,
        });
      });

      li.appendChild(button);
      list.appendChild(li);
    }
  }
});

// 5. Handle receiving offer
socket.on("offer", async ({ from, offer }) => {
  targetUser = from;
  peerconn = createPeerConnection();

  await peerconn.setRemoteDescription(offer);

  for (const candidate of pendingCandidates) {
    try {
      await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
      console.log("✅ Applied queued ICE candidate");
    } catch (err) {
      console.error("❌ Error adding queued ICE candidate", err);
    }
  }
  pendingCandidates.length = 0;

  const answer = await peerconn.createAnswer();
  await peerconn.setLocalDescription(answer);

  socket.emit("answer", {
    from: naam,
    to: from,
    answer: peerconn.localDescription,
  });
});

// 6. Handle answer
socket.on("answer", async ({ answer }) => {
  if (peerconn.signalingState === "have-local-offer") {
    await peerconn.setRemoteDescription(answer);

    for (const candidate of pendingCandidates) {
      try {
        await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("✅ Applied queued ICE candidate (answer)");
      } catch (err) {
        console.error("❌ Error adding ICE candidate (answer)", err);
      }
    }
    pendingCandidates.length = 0;
  } else {
    console.warn("Unexpected signaling state:", peerconn.signalingState);
  }
});

// 7. Handle ICE candidates
socket.on("icecandidate", async ({ candidate }) => {
  if (!candidate || !candidate.candidate) return;

  if (peerconn) {
    if (peerconn.remoteDescription && peerconn.remoteDescription.type) {
      try {
        await peerconn.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("✅ Added ICE candidate:", candidate);
      } catch (err) {
        console.error("❌ Error adding ICE candidate", err);
      }
    } else {
      console.log("⏳ Remote description not set. Queuing ICE candidate.");
      pendingCandidates.push(candidate);
    }
  } else {
    console.warn("⚠️ Peer connection not initialized. Dropping ICE candidate.");
  }
});