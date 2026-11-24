import { useMediaQuery } from "./useMediaQuery";

export const useDarkMode = () => useMediaQuery("(prefers-color-scheme: dark)");
