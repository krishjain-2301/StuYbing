import { notFound } from "next/navigation";

export default function RoomNotFound() {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4">
      <p className="font-display text-4xl">Room not found</p>
      <p className="mt-2 text-[var(--muted)]">
        Check the invite code and try again.
      </p>
      <a href="/rooms/join" className="btn-primary mt-6 w-fit">
        Join a room
      </a>
    </div>
  );
}
