import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../context/ThemeProvider';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button className="btn btn-ghost icon-btn round" onClick={toggle} aria-label="Ganti tema">
      {theme === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
    </button>
  );
}
