export interface ThemeColors {
  primary: string;
  secondary: string;
  success: string;
  error: string;
  warning: string;
  muted: string;
  background: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
}

export const defaultTheme: ThemeColors = {
  primary: "#8B6914",
  secondary: "#A0782C",
  success: "#6B8E23",
  error: "#C0392B",
  warning: "#D4A017",
  muted: "#8B7D6B",
  background: "#1C1814",
  border: "#3E3227",
  text: "#E8DCC8",
  textMuted: "#8B7D6B",
  accent: "#C4A35A",
};

export const lightTheme: ThemeColors = {
  primary: "#8B6914",
  secondary: "#A0782C",
  success: "#6B8E23",
  error: "#C0392B",
  warning: "#D4A017",
  muted: "#A09080",
  background: "#F5F0E8",
  border: "#D4C9B8",
  text: "#3C3228",
  textMuted: "#8B7D6B",
  accent: "#8B6914",
};
