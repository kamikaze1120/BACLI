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
  primary: "#1F3864",
  secondary: "#4A90D9",
  success: "#27AE60",
  error: "#E74C3C",
  warning: "#F39C12",
  muted: "#95A5A6",
  background: "#1E1E2E",
  border: "#313244",
  text: "#CDD6F4",
  textMuted: "#6C7086",
  accent: "#89B4FA",
};

export const lightTheme: ThemeColors = {
  primary: "#1F3864",
  secondary: "#4A90D9",
  success: "#27AE60",
  error: "#E74C3C",
  warning: "#F39C12",
  muted: "#95A5A6",
  background: "#FFFFFF",
  border: "#E0E0E0",
  text: "#333333",
  textMuted: "#999999",
  accent: "#1F3864",
};
