import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#100E0A",
        brand: "#1A1560",
        diet: "#12995A",
        crm: "#5346E6",
        work: "#1568D4",
        energy: "#FF4D22",
        paper: "#F7F6F2",
      },
    },
  },
  plugins: [],
} satisfies Config;
