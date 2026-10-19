import { useState } from "react";
import ReplayUpload from "./components/ReplayUpload.jsx";
import ReplaysPage from "./pages/ReplaysPage.jsx";

export default function App() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main>
      <h1>RL-Coach</h1>
      <ReplayUpload onUploaded={() => setRefreshKey((k) => k + 1)} />
      <ReplaysPage refreshKey={refreshKey} />
    </main>
  );
}
