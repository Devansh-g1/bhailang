import React, { useEffect, useRef, useState } from "react";
import Client from "./Client";
import Editor from "./Editor";
import { initSocket } from "../Socket";
import { ACTIONS } from "../Actions";
import {
  useNavigate,
  useLocation,
  Navigate,
  useParams,
} from "react-router-dom";
import { toast } from "react-hot-toast";
import axios from "axios";

const LANGUAGES = [
  "python3",
  "java",
  "cpp",
  "nodejs",
  "c",
  "ruby",
  "go",
  "scala",
  "bash",
  "sql",
  "pascal",
  "csharp",
  "php",
  "swift",
  "rust",
  "r",
];

function EditorPage() {
  const [clients, setClients] = useState([]);
  const [output, setOutput] = useState("");
  const [isCompileWindowOpen, setIsCompileWindowOpen] = useState(false);
  const [isCompiling, setIsCompiling] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("python3");
  const [aiSuggestions, setAiSuggestions] = useState(null);
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false);
  const codeRef = useRef(null);

  const location = useLocation();
  const navigate = useNavigate();
  const { roomId } = useParams();

  const socketRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      socketRef.current = await initSocket();
      socketRef.current.on("connect_error", (err) => handleErrors(err));
      socketRef.current.on("connect_failed", (err) => handleErrors(err));

      const handleErrors = (err) => {
        console.log("Error", err);
        toast.error("Socket connection failed, Try again later");
        navigate("/");
      };

      socketRef.current.emit(ACTIONS.JOIN, {
        roomId,
        username: location.state?.username,
      });

      socketRef.current.on(
        ACTIONS.JOINED,
        ({ clients, username, socketId }) => {
          if (username !== location.state?.username) {
            toast.success(`${username} joined the room.`);
          }
          setClients(clients);
          socketRef.current.emit(ACTIONS.SYNC_CODE, {
            code: codeRef.current,
            socketId,
          });
        }
      );

      socketRef.current.on(ACTIONS.DISCONNECTED, ({ socketId, username }) => {
        toast.success(`${username} left the room`);
        setClients((prev) => {
          return prev.filter((client) => client.socketId !== socketId);
        });
      });
    };
    init();

    return () => {
      socketRef.current && socketRef.current.disconnect();
      socketRef.current.off(ACTIONS.JOINED);
      socketRef.current.off(ACTIONS.DISCONNECTED);
    };
  }, []);

  if (!location.state) {
    return <Navigate to="/" />;
  }

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      toast.success(`Room ID is copied`);
    } catch (error) {
      console.log(error);
      toast.error("Unable to copy the room ID");
    }
  };

  const leaveRoom = () => {
    navigate("/");
  };

  const runCode = async () => {
    setIsCompiling(true);
    try {
      const response = await axios.post("http://localhost:4000/compile", {
        code: codeRef.current,
        language: selectedLanguage,
      });
      console.log("Backend response:", response.data);
      setOutput(response.data.output || JSON.stringify(response.data));
    } catch (error) {
      console.error("Error compiling code:", error);
      setOutput(error.response?.data?.error || "An error occurred");
    } finally {
      setIsCompiling(false);
    }
  };

  const getAiSuggestions = async () => {
    setIsAiAnalyzing(true);
    try {
      const response = await axios.post("http://localhost:4000/ai-suggestions", {
        code: codeRef.current,
        language: selectedLanguage,
      });
      setAiSuggestions(response.data);
    } catch (error) {
      console.error("Error getting AI suggestions:", error);
      toast.error("Failed to get AI suggestions");
    } finally {
      setIsAiAnalyzing(false);
    }
  };

  const toggleCompileWindow = () => {
    setIsCompileWindowOpen(!isCompileWindowOpen);
  };

  return (
    <div className="container-fluid vh-100 d-flex flex-column">
      <div className="row flex-grow-1">
        {/* Client panel */}
        <div className="col-md-2 bg-dark text-light d-flex flex-column">
          <img
            src="/images/codecast.png"
            alt="Logo"
            className="img-fluid mx-auto"
            style={{ maxWidth: "150px", marginTop: "-43px" }}
          />
          <hr style={{ marginTop: "-3rem" }} />

          {/* Client list container */}
          <div className="d-flex flex-column flex-grow-1 overflow-auto">
            <span className="mb-2">Members</span>
            {clients.map((client) => (
              <Client key={client.socketId} username={client.username} />
            ))}
          </div>

          <hr />
          {/* Buttons */}
          <div className="mt-auto mb-3">
            <button className="btn btn-success w-100 mb-2" onClick={copyRoomId}>
              Copy Room ID
            </button>
            <button className="btn btn-danger w-100" onClick={leaveRoom}>
              Leave Room
            </button>
          </div>
        </div>

        {/* Editor panel */}
        <div className="col-md-10 text-light d-flex flex-column">
          {/* Language selector and AI Suggestions button */}
          <div className="bg-dark p-2 d-flex justify-content-between align-items-center">
            <select
              className="form-select w-auto"
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
            >
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              className="btn btn-primary"
              onClick={getAiSuggestions}
              disabled={isAiAnalyzing}
            >
              {isAiAnalyzing ? "Analyzing..." : "Get AI Suggestions"}
            </button>
          </div>

          <Editor
            socketRef={socketRef}
            roomId={roomId}
            onCodeChange={(code) => {
              codeRef.current = code;
            }}
          />
        </div>
      </div>

      {/* Compiler toggle button */}
      <button
        className="btn btn-primary position-fixed bottom-0 end-0 m-3"
        onClick={toggleCompileWindow}
        style={{ zIndex: 1050 }}
      >
        {isCompileWindowOpen ? "Close Compiler" : "Open Compiler"}
      </button>

      {/* Compiler section */}
      <div
        className={`bg-dark text-light p-3 ${
          isCompileWindowOpen ? "d-block" : "d-none"
        }`}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: isCompileWindowOpen ? "30vh" : "0",
          transition: "height 0.3s ease-in-out",
          overflowY: "auto",
          zIndex: 1040,
        }}
      >
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h5 className="m-0">Compiler Output ({selectedLanguage})</h5>
          <div>
            <button
              className="btn btn-success me-2"
              onClick={runCode}
              disabled={isCompiling}
            >
              {isCompiling ? "Compiling..." : "Run Code"}
            </button>
            <button className="btn btn-secondary" onClick={toggleCompileWindow}>
              Close
            </button>
          </div>
        </div>
        <pre className="bg-secondary p-3 rounded">
          {output || "Output will appear here after compilation"}
        </pre>
      </div>

{/* AI Suggestions Modal */}
{aiSuggestions && (
  <div
    className="modal fade show"
    style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
  >
    <div className="modal-dialog modal-xl">
      <div className="modal-content">
        <div className="modal-header">
          <h5 className="modal-title">AI Code Analysis & Suggestions</h5>
          <button
            type="button"
            className="btn-close"
            onClick={() => setAiSuggestions(null)}
          ></button>
        </div>
        <div className="modal-body">
          <nav>
            <div className="nav nav-tabs" id="nav-tab" role="tablist">
              <button
                className="nav-link active"
                id="nav-analysis-tab"
                data-bs-toggle="tab"
                data-bs-target="#nav-analysis"
                type="button"
                role="tab"
                aria-selected="true"
              >
                Current Analysis
              </button>
              <button
                className="nav-link"
                id="nav-next-tab"
                data-bs-toggle="tab"
                data-bs-target="#nav-next"
                type="button"
                role="tab"
                aria-selected="false"
              >
                Next Level Code
              </button>
              <button
                className="nav-link"
                id="nav-optimized-tab"
                data-bs-toggle="tab"
                data-bs-target="#nav-optimized"
                type="button"
                role="tab"
                aria-selected="false"
              >
                Optimized Version
              </button>
            </div>
          </nav>
          
          <div className="tab-content mt-3" id="nav-tabContent">
            {/* Current Analysis Tab */}
            <div
              className="tab-pane fade show active"
              id="nav-analysis"
              role="tabpanel"
            >
              <h6>Improvements:</h6>
              <ul>
                {aiSuggestions.improvements.map((improvement, index) => (
                  <li key={index}>{improvement}</li>
                ))}
              </ul>
              <h6>Complexity:</h6>
              <p>Time Complexity: {aiSuggestions.complexity.time}</p>
              <p>Space Complexity: {aiSuggestions.complexity.space}</p>
              <h6>Explanation:</h6>
              <p>{aiSuggestions.explanation}</p>
              <h6>Inferred Purpose:</h6>
              <p>{aiSuggestions.purpose}</p>
            </div>

            {/* Next Level Code Tab */}
            <div
              className="tab-pane fade"
              id="nav-next"
              role="tabpanel"
            >
              <div className="mb-4">
                <h6>Why Try This Next:</h6>
                <p>{aiSuggestions.nextLevelSuggestion?.description}</p>
                
                <h6>Skills You'll Learn:</h6>
                <ul>
                  {aiSuggestions.nextLevelSuggestion?.skillsToLearn.map((skill, index) => (
                    <li key={index}>{skill}</li>
                  ))}
                </ul>

                <h6>Suggested Code:</h6>
                <div className="bg-light p-3 rounded mb-3">
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    <code>{aiSuggestions.nextLevelSuggestion?.code}</code>
                  </pre>
                </div>

                <h6>Explanation of New Concepts:</h6>
                <p>{aiSuggestions.nextLevelSuggestion?.explanation}</p>

                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    if (aiSuggestions.nextLevelSuggestion?.code) {
                      codeRef.current = aiSuggestions.nextLevelSuggestion.code;
                      socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code: aiSuggestions.nextLevelSuggestion.code,
                      });
                      setAiSuggestions(null);
                    }
                  }}
                >
                  Try This Advanced Version
                </button>
              </div>
            </div>

            {/* Optimized Version Tab */}
            <div
              className="tab-pane fade"
              id="nav-optimized"
              role="tabpanel"
            >
              <div className="mb-4">
                <h6>Optimization Details:</h6>
                <p>{aiSuggestions.optimizedVersion?.description}</p>

                <h6>Improved Complexity:</h6>
                <p>Time Complexity: {aiSuggestions.optimizedVersion?.complexity.time}</p>
                <p>Space Complexity: {aiSuggestions.optimizedVersion?.complexity.space}</p>

                <h6>Key Improvements:</h6>
                <ul>
                  {aiSuggestions.optimizedVersion?.improvements.map((improvement, index) => (
                    <li key={index}>{improvement}</li>
                  ))}
                </ul>

                <h6>Optimized Code:</h6>
                <div className="bg-light p-3 rounded mb-3">
                  <pre style={{ whiteSpace: 'pre-wrap' }}>
                    <code>{aiSuggestions.optimizedVersion?.code}</code>
                  </pre>
                </div>

                <button 
                  className="btn btn-primary"
                  onClick={() => {
                    if (aiSuggestions.optimizedVersion?.code) {
                      codeRef.current = aiSuggestions.optimizedVersion.code;
                      socketRef.current.emit(ACTIONS.CODE_CHANGE, {
                        roomId,
                        code: aiSuggestions.optimizedVersion.code,
                      });
                      setAiSuggestions(null);
                    }
                  }}
                >
                  Try Optimized Version
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
)}
</div>
  )
}
export default EditorPage;