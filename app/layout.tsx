import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'AptiQuiz',
  description: 'Live multiplayer aptitude practice built for fast, fair quiz battles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
