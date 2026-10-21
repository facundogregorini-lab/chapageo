import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <h1 className="text-xl font-bold">No encontramos esto en tu cuenta</h1>
      <p className="mt-2 text-sm text-mute">El cliente, el análisis o la respuesta no existe o pertenece a otra agencia.</p>
      <Link href="/app" className="btn-primary mt-5">Volver a clientes</Link>
    </div>
  );
}
