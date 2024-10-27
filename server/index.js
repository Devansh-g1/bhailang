import express from "express";
const app = express();
import http from "http";
import { Server } from "socket.io";
import ACTIONS from "./Actions.js";
import cors from "cors";
import axios from "axios";
import GroqApi from "groq"; // If it's a default export
const server = http.createServer(app);
import dotenv from "dotenv";
dotenv.config();

import Groq from "groq-sdk";

const languageConfig = {
  python3: { versionIndex: "3" },
  java: { versionIndex: "3" },
  cpp: { versionIndex: "4" },
  nodejs: { versionIndex: "3" },
  c: { versionIndex: "4" },
  ruby: { versionIndex: "3" },
  go: { versionIndex: "3" },
  scala: { versionIndex: "3" },
  bash: { versionIndex: "3" },
  sql: { versionIndex: "3" },
  pascal: { versionIndex: "2" },
  csharp: { versionIndex: "3" },
  php: { versionIndex: "3" },
  swift: { versionIndex: "3" },
  rust: { versionIndex: "3" },
  r: { versionIndex: "3" },
};

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"; 

app.use(cors());
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"],
  },
});

const userSocketMap = {};
const getAllConnectedClients = (roomId) => {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map(
    (socketId) => ({
      socketId,
      username: userSocketMap[socketId],
    })
  );
};

io.on("connection", (socket) => {
  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;
    socket.join(roomId);
    const clients = getAllConnectedClients(roomId);
    clients.forEach(({ socketId }) => {
      io.to(socketId).emit(ACTIONS.JOINED, {
        clients,
        username,
        socketId: socket.id,
      });
    });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on("disconnecting", () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      socket.in(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id,
        username: userSocketMap[socket.id],
      });
    });
    delete userSocketMap[socket.id];
    socket.leave();
  });
});

app.post("/compile", async (req, res) => {
  const { code, language } = req.body;
  try {
    const response = await axios.post("https://api.jdoodle.com/v1/execute", {
      script: code,
      language: language,
      versionIndex: languageConfig[language].versionIndex,
      clientId: process.env.jDoodle_clientId,
      clientSecret: process.env.kDoodle_clientSecret,
    });
    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to compile code" });
  }
});

async function getAISuggestions(code, language) {
  const prompt = `
    Analyze the following ${language} code and provide a comprehensive analysis including:
    1. Code quality and best practices
    2. Performance optimizations
    3. Potential bugs or edge cases
    4. Time and space complexity analysis
    5. Provide a next-level code suggestion that the user should try to enhance their skills
    6. Provide an optimized version of the current code with minimum space and time complexity

    Code:
    ${code}

    Format your response as a JSON object with the following structure:
    {
      "improvements": ["suggestion1", "suggestion2", ...],
      "complexity": {
        "time": "Big O notation",
        "space": "Big O notation"
      },
      "explanation": "Brief explanation of the code",
      "purpose": "Inferred purpose of the code",
      "nextLevelSuggestion": {
        "description": "Description of why this next code will help improve skills",
        "skillsToLearn": ["skill1", "skill2", ...],
        "code": "Complete code that introduces new concepts",
        "explanation": "Explanation of new concepts introduced"
      },
      "optimizedVersion": {
        "description": "Description of optimizations made",
        "complexity": {
          "time": "Improved time complexity",
          "space": "Improved space complexity"
        },
        "code": "Optimized version of the code",
        "improvements": ["improvement1", "improvement2", ...]
      }
    }

    Ensure that:
    1. The next level suggestion introduces more advanced concepts suitable for learning
    2. The optimized version focuses on reducing time and space complexity
    3. Both suggested codes are complete and runnable
    4. Explanations are clear and educational
    5. Your entire response is valid JSON
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "mixtral-8x7b-32768",
      temperature: 0.7,
      max_tokens: 2000, // Increased to accommodate larger response
    });

    const aiResponse = completion.choices[0].message.content;
    
    try {
      return JSON.parse(aiResponse);
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", aiResponse);
      return {
        error: "The AI response was not in the expected JSON format.",
        rawResponse: aiResponse
      };
    }
  } catch (error) {
    console.error("Error calling Groq API:", error.response?.data || error.message);
    throw new Error("Failed to get AI suggestions");
  }
}

app.post("/ai-suggestions", async (req, res) => {
  const { code, language } = req.body;
  try {
    const aiSuggestions = await getAISuggestions(code, language);
    res.json(aiSuggestions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to get AI suggestions", details: error.message });
  }
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => console.log(`Server is running on port ${PORT}`));