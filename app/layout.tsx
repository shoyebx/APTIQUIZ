import './globals.css';
import type { Metadata } from 'next';
import { ProfileProvider } from '@/components/profile-context';

export const metadata: Metadata = {
  title: 'AptiQuiz',
  description: 'Live multiplayer aptitude practice built for fast, fair quiz battles.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body><ProfileProvider>{children}</ProfileProvider></body>
    </html>
  );
}
