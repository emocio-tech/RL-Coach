export default function ReplaysPage({ lastUploadId }) {
  return (
    <section>
      {lastUploadId && <p>Replay importé (id : {lastUploadId})</p>}
    </section>
  );
}
