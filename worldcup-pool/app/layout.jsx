import "./globals.css";

export const metadata = {
  title: "The Gaffers — World Cup 2026 Pool",
  description: "Draft 4 players + 3 teams. Goals, assists, and how far your teams go all bank points.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
