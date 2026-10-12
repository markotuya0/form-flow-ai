import { ChatWindow } from "@/components/ChatWindow";

export default function Home() {
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto mb-6 max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-widest text-primary">
          FormFlow AI
        </p>
        <h1 className="mt-1 text-3xl font-bold">Forms without the boring form</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a form above, answer a few quick questions in the chat, and
          you&apos;re done. Takes about a minute — answers are checked as you go.
        </p>
      </div>
      <ChatWindow />
    </main>
  );
}
