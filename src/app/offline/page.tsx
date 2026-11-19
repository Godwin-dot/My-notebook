import Link from "next/link";

export default function OfflinePage() {
  return (
    <main className="offline-page">
      <p className="collection-kicker">NOTEBOOK · MODE HORS LIGNE</p>
      <h1>Votre espace reste ici.</h1>
      <p>Cette page n’est pas encore disponible hors connexion. Vos notes enregistrées localement restent accessibles.</p>
      <Link href="/">Retourner à Notebook</Link>
    </main>
  );
}
