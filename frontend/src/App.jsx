import { useState } from "react";
import ReplayUpload from "./components/ReplayUpload.jsx";
import ReplaysPage from "./pages/ReplaysPage.jsx";

export default function App() {
  const [lastUploadId, setLastUploadId] = useState(null);

  return (
    <main>
      <h1>RL-Coach</h1>
      <ReplayUpload onUploaded={(result) => setLastUploadId(result.id)} />
      <ReplaysPage lastUploadId={lastUploadId} />
    </main>
  );
}
