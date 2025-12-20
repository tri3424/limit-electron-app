import { Children, ReactNode, isValidElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Bold, Italic, Underline, Strikethrough, Undo2, Redo2, AlignLeft, AlignCenter, AlignRight, Sigma, Image as ImageIcon, Eraser, Copy, Loader2, RefreshCcw, Search, PlusCircle, BookOpen, Library, Code2, Eye, Pencil, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown, { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import katex from 'katex';
import 'katex/dist/katex.min.css';

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  enableBlanksButton?: boolean;
};

function exec(cmd: string, value?: string) {
  document.execCommand(cmd, false, value);
}

function insertHtmlAtCursor(html: string) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const el = document.createElement('div');
  el.innerHTML = html;
  const frag = document.createDocumentFragment();
  let node: ChildNode | null;
  let lastNode: ChildNode | null = null;
  while ((node = el.firstChild)) {
    lastNode = frag.appendChild(node);
  }
  range.insertNode(frag);
  if (lastNode) {
    range.setStartAfter(lastNode);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}

function isDescendant(parent: Node | null, child: Node | null) {
  if (!parent || !child) return false;
  let node: Node | null = child;
  while (node) {
    if (node === parent) return true;
    node = node.parentNode;
  }
  return false;
}

// Strip background-related styles from an element subtree
function stripBackgroundStyles(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  let current = walker.currentNode as HTMLElement | null;
  while (current) {
    const style = current.getAttribute('style');
    if (style && /background/i.test(style)) {
      current.style.background = '';
      current.style.backgroundColor = '';
    }
    current = walker.nextNode() as HTMLElement | null;
  }
}

const FOCUS_WARNING_TIMEOUT = 8000;
const GUIDE_FILE = `${import.meta.env.BASE_URL}katex-guide.md`;
const TABLE_FILE = `${import.meta.env.BASE_URL}katex-support-table.md`;
const GUIDE_HIGHLIGHT_CLASSES = ['ring-2', 'ring-amber-400', 'rounded-md', 'bg-amber-50'];

const sanitizeMarkdown = (raw: string) =>
  raw
    .replace(/^---[\s\S]+?---\s*/g, '')
    .replace(/<link[^>]+>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

// Comprehensive KaTeX snippets
const SNIPPET_PRESETS = [
  // Fractions
  { label: 'Fraction', snippet: '\\frac{a}{b}', category: 'Fractions' },
  { label: 'Mixed fraction', snippet: '1\\frac{1}{2}', category: 'Fractions' },
  { label: 'Continued fraction', snippet: '\\cfrac{1}{2+\\cfrac{1}{2}}', category: 'Fractions' },
  // Roots
  { label: 'Square root', snippet: '\\sqrt{x}', category: 'Roots' },
  { label: 'Nth root', snippet: '\\sqrt[n]{x}', category: 'Roots' },
  { label: 'Cubic root', snippet: '\\sqrt[3]{x}', category: 'Roots' },
  // Sums and Products
  { label: 'Summation', snippet: '\\sum_{i=1}^{n} i', category: 'Sums & Products' },
  { label: 'Product', snippet: '\\prod_{i=1}^{n} i', category: 'Sums & Products' },
  { label: 'Series', snippet: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2}', category: 'Sums & Products' },
  // Integrals
  { label: 'Integral', snippet: '\\int_{a}^{b} x^2 \\, dx', category: 'Integrals' },
  { label: 'Definite integral', snippet: '\\int_{0}^{\\pi} \\sin x \\, dx', category: 'Integrals' },
  { label: 'Double integral', snippet: '\\iint_D f(x,y) \\, dx \\, dy', category: 'Integrals' },
  { label: 'Triple integral', snippet: '\\iiint_V f(x,y,z) \\, dx \\, dy \\, dz', category: 'Integrals' },
  { label: 'Contour integral', snippet: '\\oint_C f(z) \\, dz', category: 'Integrals' },
  // Limits
  { label: 'Limit', snippet: '\\lim_{x \\to 0} \\frac{\\sin x}{x}', category: 'Limits' },
  { label: 'Limit at infinity', snippet: '\\lim_{x \\to \\infty} \\frac{1}{x}', category: 'Limits' },
  { label: 'Exponential limit', snippet: '\\lim_{x \\to \\infty} \\left(1 + \\frac{1}{x}\\right)^x', category: 'Limits' },
  // Matrices
  { label: 'Matrix', snippet: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', category: 'Matrices' },
  { label: 'PMatrix', snippet: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', category: 'Matrices' },
  { label: 'Determinant', snippet: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', category: 'Matrices' },
  { label: 'VMatrix', snippet: '\\begin{Vmatrix} a & b \\\\ c & d \\end{Vmatrix}', category: 'Matrices' },
  { label: 'BMatrix', snippet: '\\begin{Bmatrix} a & b \\\\ c & d \\end{Bmatrix}', category: 'Matrices' },
  { label: 'Small matrix', snippet: '\\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix}', category: 'Matrices' },
  // Binomials
  { label: 'Binomial', snippet: '\\binom{n}{k}', category: 'Binomials' },
  { label: 'Multinomial', snippet: '\\binom{n}{k_1,k_2,k_3}', category: 'Binomials' },
  // Vectors
  { label: 'Vector', snippet: '\\vec{v} = \\langle a, b, c \\rangle', category: 'Vectors' },
  { label: 'Unit vector', snippet: '\\hat{v}', category: 'Vectors' },
  { label: 'Arrow', snippet: '\\overrightarrow{AB}', category: 'Vectors' },
  // Accents
  { label: 'Hat', snippet: '\\hat{x}', category: 'Accents' },
  { label: 'Bar', snippet: '\\bar{x}', category: 'Accents' },
  { label: 'Tilde', snippet: '\\tilde{x}', category: 'Accents' },
  { label: 'Dot', snippet: '\\dot{x}', category: 'Accents' },
  { label: 'Double dot', snippet: '\\ddot{x}', category: 'Accents' },
  { label: 'Acute', snippet: '\\acute{x}', category: 'Accents' },
  { label: 'Grave', snippet: '\\grave{x}', category: 'Accents' },
  { label: 'Breve', snippet: '\\breve{x}', category: 'Accents' },
  { label: 'Check', snippet: '\\check{x}', category: 'Accents' },
  // Greek letters
  { label: 'Greek alpha', snippet: '\\alpha + \\beta + \\gamma', category: 'Greek Letters' },
  { label: 'Greek uppercase', snippet: '\\Alpha, \\Beta, \\Gamma', category: 'Greek Letters' },
  { label: 'Greek theta', snippet: '\\theta, \\Theta, \\vartheta', category: 'Greek Letters' },
  { label: 'Greek phi', snippet: '\\phi, \\Phi, \\varphi', category: 'Greek Letters' },
  // Functions
  { label: 'Sine', snippet: '\\sin(x)', category: 'Functions' },
  { label: 'Cosine', snippet: '\\cos(x)', category: 'Functions' },
  { label: 'Tangent', snippet: '\\tan(x)', category: 'Functions' },
  { label: 'Logarithm', snippet: '\\log(x)', category: 'Functions' },
  { label: 'Natural log', snippet: '\\ln(x)', category: 'Functions' },
  { label: 'Exponential', snippet: 'e^{x}', category: 'Functions' },
  // Piecewise
  { label: 'Piecewise', snippet: '\\begin{cases} ax + b & x > 0 \\\\ cx + d & x \\le 0 \\end{cases}', category: 'Piecewise' },
  // Operators
  { label: 'Partial derivative', snippet: '\\frac{\\partial f}{\\partial x}', category: 'Operators' },
  { label: 'Nabla', snippet: '\\nabla f', category: 'Operators' },
  { label: 'Gradient', snippet: '\\nabla \\cdot \\vec{F}', category: 'Operators' },
  { label: 'Laplacian', snippet: '\\nabla^2 f', category: 'Operators' },
  // Relations
  { label: 'Not equal', snippet: 'a \\neq b', category: 'Relations' },
  { label: 'Approximately', snippet: 'a \\approx b', category: 'Relations' },
  { label: 'Proportional', snippet: 'a \\propto b', category: 'Relations' },
  { label: 'Less or equal', snippet: 'a \\leq b', category: 'Relations' },
  { label: 'Greater or equal', snippet: 'a \\geq b', category: 'Relations' },
  { label: 'Much less', snippet: 'a \\ll b', category: 'Relations' },
  { label: 'Much greater', snippet: 'a \\gg b', category: 'Relations' },
  // Sets
  { label: 'Element of', snippet: 'x \\in A', category: 'Sets' },
  { label: 'Not in', snippet: 'x \\notin A', category: 'Sets' },
  { label: 'Subset', snippet: 'A \\subset B', category: 'Sets' },
  { label: 'Union', snippet: 'A \\cup B', category: 'Sets' },
  { label: 'Intersection', snippet: 'A \\cap B', category: 'Sets' },
  { label: 'Empty set', snippet: '\\emptyset', category: 'Sets' },
  // Arrows
  { label: 'Right arrow', snippet: 'A \\to B', category: 'Arrows' },
  { label: 'Left arrow', snippet: 'A \\leftarrow B', category: 'Arrows' },
  { label: 'Leftrightarrow', snippet: 'A \\leftrightarrow B', category: 'Arrows' },
  { label: 'Implies', snippet: 'A \\implies B', category: 'Arrows' },
  { label: 'Iff', snippet: 'A \\iff B', category: 'Arrows' },
  // Delimiters
  { label: 'Absolute value', snippet: '|x|', category: 'Delimiters' },
  { label: 'Norm', snippet: '\\|x\\|', category: 'Delimiters' },
  { label: 'Floor', snippet: '\\lfloor x \\rfloor', category: 'Delimiters' },
  { label: 'Ceiling', snippet: '\\lceil x \\rceil', category: 'Delimiters' },
  // Other
  { label: 'Infinity', snippet: '\\infty', category: 'Other' },
  { label: 'Partial', snippet: '\\partial', category: 'Other' },
  { label: 'Prime', snippet: 'f\'(x)', category: 'Other' },
  { label: 'Ellipsis', snippet: 'x_1, x_2, \\ldots, x_n', category: 'Other' },
  // Macros
  { label: 'Real numbers macro', snippet: '\\newcommand{\\R}{\\mathbb{R}}', category: 'Macros' },
  { label: 'Bold vector macro', snippet: '\\newcommand{\\vecb}[1]{\\mathbf{#1}}', category: 'Macros' },
  { label: 'Expectation macro', snippet: '\\newcommand{\\E}{\\mathbb{E}}', category: 'Macros' },
  { label: 'Variance macro', snippet: '\\newcommand{\\Var}{\\operatorname{Var}}', category: 'Macros' },
  { label: 'Floor macro', snippet: '\\newcommand{\\floor}[1]{\\lfloor #1 \\rfloor}', category: 'Macros' },
];

const getMarkdownComponents = (
  onInsertSnippet: (snippet: string) => void
): Components => ({
  table: ({ children }) => <div className="space-y-6">{children}</div>,
  thead: ({ children }) => <div className="space-y-6">{children}</div>,
  tbody: ({ children }) => <div className="space-y-6">{children}</div>,
  tr: ({ children }) => <div className="space-y-3">{children}</div>,
  th: ({ children }) => (
    <div className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </div>
  ),
  td: ({ children }) => {
    const nodes = Children.toArray(children).filter(
      (node) => !(typeof node === 'string' && !node.trim())
    );
    const latexNode = nodes.find(
      (node) => isValidElement(node) && node.type === 'code'
    ) as React.ReactElement | undefined;
    const latexString = latexNode ? String(latexNode.props.children).trim() : '';
    const previewNodes = nodes.filter((node) => node !== latexNode);

    return (
      <div className="rounded-2xl border border-border/60 bg-background/80 p-4 shadow-sm space-y-3">
        {previewNodes.length > 0 && (
          <div className="text-lg text-foreground flex flex-wrap gap-2">{previewNodes}</div>
        )}
        {latexString && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 px-3 py-2 font-mono text-sm">
            <span className="truncate">{latexString}</span>
            <button
              type="button"
              className="ml-auto inline-flex items-center gap-1 text-primary hover:text-primary/80 text-sm"
              onClick={() => onInsertSnippet(latexString)}
            >
              <PlusCircle className="h-4 w-4" />
              Insert
            </button>
          </div>
        )}
      </div>
    );
  },
  code: ({ inline, className, children, ...props }: any) => {
    const textValue = String(children ?? '').trim();
    if (inline) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-0.5 font-mono text-sm text-foreground shadow-sm">
          <code {...props}>{children}</code>
          <button
            type="button"
            className="text-primary hover:text-primary/80"
            onClick={() => onInsertSnippet(textValue)}
            title="Insert into equation editor"
          >
            <PlusCircle className="h-4 w-4" />
          </button>
        </span>
      );
    }
    return (
      <pre className="overflow-x-auto rounded-lg bg-muted/50 p-4 text-sm text-foreground shadow-inner">
        <code className={className} {...props}>
          {children}
        </code>
      </pre>
    );
  },
  h2: ({ node, children, ...props }) => {
    const text = String(children);
    const id = `guide-${slugify(text)}`;
    return (
      <h2 id={id} className="mt-8 scroll-mt-24 text-2xl font-semibold" {...props}>
        {children}
      </h2>
    );
  },
});

export default function RichTextEditor({ value, onChange, placeholder, className, enableBlanksButton = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [eqOpen, setEqOpen] = useState(false);
  const [eqPreviewOpen, setEqPreviewOpen] = useState(false);
  const [latex, setLatex] = useState('');
  const [displayMode, setDisplayMode] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>('');
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewScale, setPreviewScale] = useState(110);
  const [active, setActive] = useState({ bold: false, italic: false, underline: false });
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideMarkdown, setGuideMarkdown] = useState('');
  const [guideTable, setGuideTable] = useState('');
  const [guideLoading, setGuideLoading] = useState(false);
  const [guideError, setGuideError] = useState<string | null>(null);
  const [guideSearch, setGuideSearch] = useState('');
  const [returnToEquationAfterGuide, setReturnToEquationAfterGuide] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [editingKatexElement, setEditingKatexElement] = useState<HTMLElement | null>(null);
  const [syntaxEditorOpen, setSyntaxEditorOpen] = useState(false);
  const [editingSyntax, setEditingSyntax] = useState<{ snippet: string; label: string } | null>(null);
  const [syntaxPlaceholders, setSyntaxPlaceholders] = useState<Record<string, string>>({});
  const selectionRef = useRef<Range | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const guideContentRef = useRef<HTMLDivElement | null>(null);
  const highlightedGuideNodesRef = useRef<HTMLElement[]>([]);
  const equationInputRef = useRef<HTMLTextAreaElement | null>(null);
  const syntaxScrollRef = useRef<HTMLDivElement | null>(null);

  const clearAllContent = () => {
    if (!ref.current) return;
    ref.current.innerHTML = '';
    onChange('');
    selectionRef.current = null;
  };

  const wrapSelectionAsBlank = () => {
    if (!ref.current) return;
    ref.current.focus();
    ensureCaretInEditor();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (!isDescendant(ref.current, range.startContainer)) return;
    if (range.collapsed) return;
    // Avoid nesting blanks
    const common = range.commonAncestorContainer as HTMLElement;
    const existingBlank = common.closest?.('[data-blank="true"]');
    if (existingBlank) return;
    const selectedText = range.toString();
    if (!selectedText.trim()) return;
    const id = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const span = document.createElement('span');
    span.setAttribute('data-blank', 'true');
    span.setAttribute('data-blank-id', id);
    span.className = 'tk-blank';
    span.textContent = selectedText;
    range.deleteContents();
    range.insertNode(span);
    // Move caret after the blank
    range.setStartAfter(span);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    selectionRef.current = range.cloneRange();
    const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
    ref.current.innerHTML = cleaned;
    onChange(cleaned);
  };


  const scrollGuideTo = (id: string) => {
    const container = guideContentRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`#${id}`);
    if (target) {
      container.scrollTo({
        top: target.offsetTop - 16,
        behavior: 'smooth',
      });
    }
  };

  // Extract placeholders from a syntax (like a, b in \frac{a}{b})
  const extractPlaceholders = (snippet: string): string[] => {
    const placeholders: string[] = [];
    // Find single-letter variables and common placeholders
    const matches = snippet.match(/\{([a-zA-Z0-9]+)\}/g);
    if (matches) {
      matches.forEach(match => {
        const placeholder = match.slice(1, -1); // Remove { }
        if (placeholder.length <= 3 && !placeholders.includes(placeholder)) {
          placeholders.push(placeholder);
        }
      });
    }
    // Also find standalone letters that are likely placeholders
    const letterMatches = snippet.match(/\b([a-z])\b/g);
    if (letterMatches) {
      letterMatches.forEach(match => {
        if (!placeholders.includes(match) && match.length === 1) {
          placeholders.push(match);
        }
      });
    }
    return [...new Set(placeholders)].slice(0, 10); // Limit to 10 placeholders
  };

  // Replace placeholders in a snippet with user values
  const replacePlaceholders = (snippet: string, values: Record<string, string>): string => {
    let result = snippet;
    Object.entries(values).forEach(([key, value]) => {
      // Replace {key} patterns
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), `{${value || key}}`);
      // Replace standalone key (if it's a single letter)
      if (key.length === 1) {
        result = result.replace(new RegExp(`\\b${key}\\b`, 'g'), value || key);
      }
    });
    return result;
  };

  const handleGuideSnippetInsert = useCallback(
    (snippet: string, label?: string) => {
      const trimmed = snippet.trim();
      if (!trimmed) return;
      
      // Extract placeholders
      const placeholders = extractPlaceholders(trimmed);
      
      // If there are placeholders, open the syntax editor
      if (placeholders.length > 0) {
        setEditingSyntax({ snippet: trimmed, label: label || 'Syntax' });
        const initialValues: Record<string, string> = {};
        placeholders.forEach(p => {
          initialValues[p] = p; // Default to placeholder name
        });
        setSyntaxPlaceholders(initialValues);
        setSyntaxEditorOpen(true);
        setLibraryOpen(false);
        setGuideOpen(false);
        return;
      }
      
      // No placeholders, insert directly
      insertSyntaxDirectly(trimmed);
    },
    []
  );

  const insertSyntaxDirectly = useCallback((snippet: string) => {
    // Close library and guide modals
    setLibraryOpen(false);
    setGuideOpen(false);
    setSyntaxEditorOpen(false);
    
    // Ensure equation modal is open
    if (!eqOpen) {
      setEqOpen(true);
    }
    
    // Insert snippet into latex input
    setLatex((prev) => {
      const current = prev.trim();
      if (!current) return snippet;
      // Smart insertion: add space if needed
      if (!/[+\-*/=<>{}()\[\]]$/.test(current[current.length - 1])) {
        return current + ' ' + snippet;
      }
      return current + snippet;
    });
    
    // Focus the equation input
    requestAnimationFrame(() => {
      equationInputRef.current?.focus();
      // Move cursor to end
      if (equationInputRef.current) {
        equationInputRef.current.setSelectionRange(
          equationInputRef.current.value.length,
          equationInputRef.current.value.length
        );
      }
    });
  }, [eqOpen]);

  const guideMarkdownComponents = useMemo(
    () => getMarkdownComponents(handleGuideSnippetInsert),
    [handleGuideSnippetInsert]
  );

  // Comprehensive KaTeX snippets with previews
  const [snippetPreviews, setSnippetPreviews] = useState<Map<string, string>>(new Map());
  const [allSyntaxes, setAllSyntaxes] = useState<Array<{ label: string; snippet: string; category: string }>>(SNIPPET_PRESETS);
  const [snippetSearch, setSnippetSearch] = useState('');
  const [activeSyntaxCategory, setActiveSyntaxCategory] = useState<string | null>(null);
  const syntaxLibrary = useMemo<{
    content: ReactNode;
    categories: string[];
    counts: Record<string, number>;
  }>(() => {
    const syntaxesToShow = allSyntaxes.length > 0 ? allSyntaxes : SNIPPET_PRESETS;
    const trimmedSearch = snippetSearch.trim();
    const filtered = trimmedSearch
      ? syntaxesToShow.filter(
          (s) =>
            s.snippet.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
            s.label.toLowerCase().includes(trimmedSearch.toLowerCase()) ||
            s.category.toLowerCase().includes(trimmedSearch.toLowerCase())
        )
      : syntaxesToShow;

    if (syntaxesToShow.length === 0 && allSyntaxes.length === 0) {
      return {
        categories: [],
        counts: {},
        content: (
          <div className="text-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mx-auto mb-3" />
            <p>Loading syntaxes...</p>
          </div>
        ),
      };
    }

    if (filtered.length === 0) {
      return {
        categories: [],
        counts: {},
        content: (
          <div className="text-center py-10 text-muted-foreground">
            <p>No syntaxes found matching "{snippetSearch}"</p>
            <p className="text-xs mt-2">Try a different search term</p>
          </div>
        ),
      };
    }

    const categories = Array.from(new Set(filtered.map((p) => p.category)));
    const counts = filtered.reduce<Record<string, number>>((acc, preset) => {
      acc[preset.category] = (acc[preset.category] || 0) + 1;
      return acc;
    }, {});

    const content = categories.map((category) => {
      const categoryItems = filtered.filter((p) => p.category === category);
      if (!categoryItems.length) return null;
      const anchorId = `syntax-category-${slugify(category)}`;

      return (
        <section key={category} id={anchorId} className="space-y-3">
          <div className="text-sm font-semibold text-foreground sticky top-0 bg-background/95 py-2 z-10 border-b border-border/40">
            {category}{' '}
            <span className="text-xs text-muted-foreground font-normal">({categoryItems.length})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {categoryItems.map((preset) => {
              const preview = snippetPreviews.get(preset.snippet);
              return (
                <button
                  key={`${preset.snippet}-${preset.label}`}
                  type="button"
                  className="group flex flex-col gap-3 rounded-xl border border-border/50 bg-card/80 p-3 text-left transition hover:border-primary/60 hover:shadow-md"
                  onClick={() => handleGuideSnippetInsert(preset.snippet, preset.label)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-foreground">{preset.label}</div>
                    <Badge variant="outline" className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      {preset.category}
                    </Badge>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background/80 p-3 min-h-[72px] flex items-center justify-center">
                    {preview ? (
                      <div className="content-html text-base text-foreground" dangerouslySetInnerHTML={{ __html: preview }} />
                    ) : (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <div className="rounded-md bg-muted/40 px-2 py-1 font-mono text-xs text-muted-foreground truncate border border-border/40">
                    {preset.snippet}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      );
    });

    return { content, categories, counts };
  }, [allSyntaxes, handleGuideSnippetInsert, snippetPreviews, snippetSearch]);

  const syntaxLibraryContent = syntaxLibrary.content;
  const syntaxCategories = syntaxLibrary.categories;
  const syntaxCategoryCounts = syntaxLibrary.counts;

  const handleSyntaxCategoryClick = useCallback((category: string) => {
    setActiveSyntaxCategory(category);
    const container = syntaxScrollRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`#syntax-category-${slugify(category)}`);
    if (target) {
      container.scrollTo({
        top: target.offsetTop - 12,
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    if (!syntaxCategories.length) {
      setActiveSyntaxCategory(null);
      return;
    }
    if (!activeSyntaxCategory || !syntaxCategories.includes(activeSyntaxCategory)) {
      setActiveSyntaxCategory(syntaxCategories[0]);
    }
  }, [activeSyntaxCategory, syntaxCategories]);

  // Parse guide markdown to extract all syntaxes.
  // To keep the app responsive, this runs only when the equation
  // or guide modals are opened, and work is done asynchronously.
  useEffect(() => {
    if ((!eqOpen && !guideOpen) || allSyntaxes.length) return;

    const parseGuideSyntaxes = async () => {
      try {
        const response = await fetch(GUIDE_FILE);
        if (!response.ok) return;
        const text = await response.text();

        const syntaxPattern = /`([^`]+)`/g;
        const matches = [...text.matchAll(syntaxPattern)];
        const uniqueSyntaxes = new Set<string>();

        for (const match of matches) {
          const syntax = match[1].trim();
          if (
            syntax &&
            (syntax.startsWith('\\') ||
              syntax.match(/^[a-zA-Z]+$/) ||
              syntax.includes('{') ||
              syntax.includes('^') ||
              syntax.includes('_') ||
              syntax.match(/^[+\-*/=<>≤≥≠≈∈∉∪∩]/))
          ) {
            const cleanSyntax = syntax
              .replace(/<br>/g, ' ')
              .replace(/&nbsp;/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();

            if (cleanSyntax.length > 0 && cleanSyntax.length < 100 && !cleanSyntax.includes('...')) {
              uniqueSyntaxes.add(cleanSyntax);
            }
          }
        }

        const syntaxes: Array<{ label: string; snippet: string; category: string }> = [];
        Array.from(uniqueSyntaxes).forEach((snippet) => {
          let category = 'Other';
          const label =
            snippet.replace(/\\/g, '').replace(/\{.*?\}/g, '').substring(0, 30) || snippet.substring(0, 30);

          if (snippet.includes('\\frac') || snippet.includes('\\cfrac') || snippet.includes('\\dfrac')) {
            category = 'Fractions';
          } else if (snippet.includes('\\sqrt')) {
            category = 'Roots';
          } else if (snippet.includes('\\sum') || snippet.includes('\\prod') || snippet.includes('\\coprod')) {
            category = 'Sums & Products';
          } else if (snippet.includes('\\int')) {
            category = 'Integrals';
          } else if (snippet.includes('\\lim')) {
            category = 'Limits';
          } else if (snippet.includes('\\begin{') && snippet.includes('matrix')) {
            category = 'Matrices';
          } else if (snippet.includes('\\binom')) {
            category = 'Binomials';
          } else if (snippet.includes('\\vec') || snippet.includes('\\overrightarrow')) {
            category = 'Vectors';
          } else if (snippet.match(/\\(hat|bar|tilde|dot|acute|grave|breve|check|mathring|vec|widehat|widetilde)/)) {
            category = 'Accents';
          } else if (
            snippet.match(
              /\\(alpha|beta|gamma|theta|phi|pi|sigma|Alpha|Beta|Gamma|Delta|epsilon|zeta|eta|iota|kappa|lambda|mu|nu|xi|omicron|rho|tau|upsilon|chi|psi|omega)/
            )
          ) {
            category = 'Greek Letters';
          } else if (
            snippet.match(/\\(sin|cos|tan|log|ln|exp|arcsin|arccos|arctan|csc|sec|cot|sinh|cosh|tanh)/)
          ) {
            category = 'Functions';
          } else if (snippet.includes('\\cases') || snippet.includes('\\begin{cases}')) {
            category = 'Piecewise';
          } else if (snippet.includes('\\partial') || snippet.includes('\\nabla') || snippet.includes('\\grad')) {
            category = 'Operators';
          } else if (
            snippet.match(/\\(neq|approx|propto|leq|geq|ll|gg|equiv|sim|simeq|cong|doteq)/)
          ) {
            category = 'Relations';
          } else if (
            snippet.match(/\\(in|notin|subset|cup|cap|emptyset|varnothing|subseteq|supset|supseteq)/)
          ) {
            category = 'Sets';
          } else if (
            snippet.match(/\\(to|leftarrow|rightarrow|leftrightarrow|implies|iff|mapsto|gets|Rightarrow|Leftarrow)/)
          ) {
            category = 'Arrows';
          } else if (
            snippet.match(/\\(lfloor|rfloor|lceil|rceil|vert|Vert|lvert|rvert|lVert|rVert|left|right|middle)/)
          ) {
            category = 'Delimiters';
          }

          syntaxes.push({ label, snippet, category });
        });

        syntaxes.sort((a, b) => {
          if (a.category !== b.category) return a.category.localeCompare(b.category);
          return a.snippet.localeCompare(b.snippet);
        });

        setAllSyntaxes(syntaxes);
      } catch (error) {
        console.error('Failed to parse guide syntaxes:', error);
        setAllSyntaxes(SNIPPET_PRESETS);
      }
    };

    // Defer heavy work until after the modal has rendered
    const id = window.setTimeout(() => {
      void parseGuideSyntaxes();
    }, 0);

    return () => window.clearTimeout(id);
  }, [eqOpen, guideOpen, allSyntaxes.length]);

  // Generate previews for all syntaxes.
  // This is also gated behind the modals being open and scheduled
  // asynchronously so the UI doesn't hang when opening.
  useEffect(() => {
    if ((!eqOpen && !guideOpen)) return;

    const syntaxesToProcess = allSyntaxes.length > 0 ? allSyntaxes : SNIPPET_PRESETS;
    if (!syntaxesToProcess.length) return;

    const run = () => {
      const newPreviews = new Map<string, string>();
      syntaxesToProcess.forEach((preset) => {
        try {
          const html = katex.renderToString(preset.snippet, { displayMode: false });
          newPreviews.set(preset.snippet, html);
        } catch {
          // Ignore errors, will show snippet text instead
        }
      });
      setSnippetPreviews(newPreviews);
    };

    if (typeof (window as any).requestIdleCallback === 'function') {
      const handle = (window as any).requestIdleCallback(run);
      return () => (window as any).cancelIdleCallback?.(handle);
    }

    const timeoutId = window.setTimeout(run, 0);
    return () => window.clearTimeout(timeoutId);
  }, [allSyntaxes, eqOpen, guideOpen]);

  const openGuideWithReturn = () => {
    setReturnToEquationAfterGuide(true);
    setEqOpen(false);
    setGuideOpen(true);
  };

  // Create a wrapper element around a KaTeX equation with hover edit/delete controls
  const createKatexWrapper = (latexSource: string, isDisplayMode: boolean): HTMLElement => {
    const wrapper = document.createElement(isDisplayMode ? 'div' : 'span');
    wrapper.className = `tk-katex-wrapper inline-block relative group ${isDisplayMode ? 'block my-2' : 'align-middle mx-0.5'}`;
    wrapper.setAttribute('data-latex', latexSource);

    const katexContainer = document.createElement('span');
    katexContainer.className = 'tk-katex-node inline-block';

    try {
      const html = katex.renderToString(latexSource, { displayMode: isDisplayMode });
      katexContainer.innerHTML = html;
    } catch {
      katexContainer.textContent = latexSource;
    }

    const innerKatex = katexContainer.querySelector('.katex') as HTMLElement | null;
    if (innerKatex) {
      innerKatex.setAttribute('data-latex', latexSource);
    }

    const controls = document.createElement('div');
    controls.className = 'pointer-events-none absolute -top-3 right-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-[11px]';
    editBtn.setAttribute('data-katex-action', 'edit');
    editBtn.title = 'Edit equation';
    editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><path d="M17 3a2.828 2.828 0 0 1 4 4L7.5 20.5 3 21l.5-4.5Z"/><path d="m15 5 4 4"/></svg>';

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-background border border-border shadow-sm text-[11px]';
    deleteBtn.setAttribute('data-katex-action', 'delete');
    deleteBtn.title = 'Delete equation';
    deleteBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>';

    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);

    wrapper.appendChild(katexContainer);
    wrapper.appendChild(controls);

    return wrapper;
  };

  const handleInsertEquation = async (closeAfterInsert = true) => {
    if (!latex.trim() || previewError) return;
    try {
      // If editing an existing equation, replace it
      if (editingKatexElement && ref.current) {
        const newWrapper = createKatexWrapper(latex, displayMode);

        if (editingKatexElement.parentNode) {
          editingKatexElement.parentNode.replaceChild(newWrapper, editingKatexElement);

          // Set selection after the new element
          const range = document.createRange();
          range.setStartAfter(newWrapper);
          range.collapse(true);
          const sel = window.getSelection();
          if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
            selectionRef.current = range.cloneRange();
          }

          onChange(ref.current.innerHTML);
        }
        setEditingKatexElement(null);
      } else {
        // Insert new equation
        if (ref.current) ref.current.focus();
        restoreSelection();
        
        const wrapper = createKatexWrapper(latex, displayMode);
        
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          range.deleteContents();
          range.insertNode(wrapper);
          range.setStartAfter(wrapper);
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
          selectionRef.current = range.cloneRange();
        }
        
        if (ref.current) {
          onChange(ref.current.innerHTML);
        }
      }
      
      if (closeAfterInsert) {
        setEqOpen(false);
        setLatex('');
        setEditingKatexElement(null);
      }
    } catch (err) {
      setPreviewError((err as Error).message || 'Unable to render equation');
    } finally {
      if (closeAfterInsert) {
        setPreviewHtml('');
      }
    }
  };

  const clearHighlights = () => {
    try {
      document.execCommand('hiliteColor', false, 'transparent');
    } catch (error) {
      // Ignore if the browser does not support hiliteColor
    }
    try {
      document.execCommand('backColor', false, 'transparent');
    } catch (error) {
      // Ignore if the browser does not support backColor
    }
    const node = ref.current;
    if (!node) return;
    const spans = node.querySelectorAll('[style*="background"]');
    spans.forEach((el) => {
      const style = (el as HTMLElement).style;
      if (style) {
        style.background = '';
        style.backgroundColor = '';
      }
    });
    onChange(node.innerHTML);
  };

  useEffect(() => {
    if (ref.current && ref.current.innerHTML !== value) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  // Normalize any existing KaTeX equations so they get hover edit/delete controls
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;

    let changed = false;
    const katexNodes = Array.from(
      editor.querySelectorAll<HTMLElement>('.katex, .katex-display, .katex-inline')
    );

    katexNodes.forEach((node) => {
      const existingWrapper = node.closest('.tk-katex-wrapper') as HTMLElement | null;
      if (existingWrapper) return;

      const latexSource =
        extractLatexFromKatex(node) ??
        node.getAttribute('data-latex') ??
        node.textContent ??
        '';

      const isDisplay =
        node.classList.contains('katex-display') ||
        node.tagName.toLowerCase() === 'div';

      const wrapper = createKatexWrapper(latexSource.trim(), isDisplay);
      const parent = node.parentNode;
      if (!parent) return;

      parent.replaceChild(wrapper, node);
      changed = true;
    });

    if (changed) {
      const cleaned = editor.innerHTML.replace(/\u200B/g, '');
      if (editor.innerHTML !== cleaned) {
        editor.innerHTML = cleaned;
      }
      onChange(cleaned);
    }
  }, [value]);

  // Extract LaTeX from rendered KaTeX HTML
  const extractLatexFromKatex = (katexElement: HTMLElement): string | null => {
    try {
      // First check for our stored data attribute (most reliable)
      const dataLatex = katexElement.getAttribute('data-latex');
      if (dataLatex) {
        return dataLatex;
      }
      
      // KaTeX stores the original LaTeX in an annotation element (if available)
      const annotation = katexElement.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation) {
        return annotation.textContent || null;
      }
      
      // Try alternative annotation selector
      const altAnnotation = katexElement.querySelector('.katex-html annotation');
      if (altAnnotation) {
        return altAnnotation.textContent || null;
      }
      
      // Fallback: try to find any annotation
      const anyAnnotation = katexElement.querySelector('annotation');
      if (anyAnnotation) {
        return anyAnnotation.textContent || null;
      }
      
      return null;
    } catch {
      return null;
    }
  };

  // Handle clicks on KaTeX elements via hover controls (edit/delete)
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const actionButton = target.closest('[data-katex-action]') as HTMLElement | null;
      if (!actionButton) return;

      const action = actionButton.getAttribute('data-katex-action');
      const wrapper = actionButton.closest('.tk-katex-wrapper') as HTMLElement | null;
      if (!wrapper) return;

      event.preventDefault();
      event.stopPropagation();

      if (action === 'edit') {
        const latexSource = extractLatexFromKatex(wrapper) ?? wrapper.getAttribute('data-latex') ?? '';
        if (!latexSource) return;

        setEditingKatexElement(wrapper);
        setLatex(latexSource);
        setDisplayMode(wrapper.tagName.toLowerCase() === 'div');
        setEqOpen(true);

        const range = document.createRange();
        range.selectNode(wrapper);
        selectionRef.current = range;
      } else if (action === 'delete') {
        if (!ref.current) return;
        const parent = wrapper.parentNode;
        if (parent) {
          parent.removeChild(wrapper);
          const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
          ref.current.innerHTML = cleaned;
          onChange(cleaned);
        }
      }
    };

    editor.addEventListener('click', handleClick, true);
    return () => {
      editor.removeEventListener('click', handleClick, true);
    };
  }, []);

  // Enable image resizing inside the editor by dragging images horizontally.
  // The resulting width is stored inline on the <img> element so it persists
  // anywhere the question/explanation HTML is rendered.
  useEffect(() => {
    const editor = ref.current;
    if (!editor) return;

    let currentImg: HTMLImageElement | null = null;
    let startX = 0;
    let startWidth = 0;

    const handleMouseMove = (event: MouseEvent) => {
      if (!currentImg) return;
      event.preventDefault();
      const deltaX = event.clientX - startX;
      const newWidth = Math.max(40, startWidth + deltaX); // Minimum width to keep image visible
      currentImg.style.width = `${newWidth}px`;
      currentImg.style.maxWidth = '100%';
      currentImg.style.height = 'auto';
    };

    const handleMouseUp = () => {
      if (!currentImg || !ref.current) {
        currentImg = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        return;
      }
      // Persist updated HTML (without zero-width spaces)
      const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
      if (ref.current.innerHTML !== cleaned) {
        ref.current.innerHTML = cleaned;
      }
      onChange(cleaned);

      currentImg = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || target.tagName !== 'IMG') return;

      const img = target as HTMLImageElement;
      // Only start resize when clicking near the bottom-right corner to act like a draggable handle
      const rect = img.getBoundingClientRect();
      const handleZoneSize = 24; // px
      const isInHandleZone =
        event.clientX >= rect.right - handleZoneSize &&
        event.clientX <= rect.right &&
        event.clientY >= rect.bottom - handleZoneSize &&
        event.clientY <= rect.bottom;

      if (!isInHandleZone) return;

      event.preventDefault();
      currentImg = img;
      startX = event.clientX;
      startWidth = rect.width;

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    editor.addEventListener('mousedown', handleMouseDown);

    return () => {
      editor.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onChange]);

  useEffect(() => {
    if (!latex.trim()) {
      setPreviewHtml('');
      setPreviewError(null);
      return;
    }
    try {
      const html = katex.renderToString(latex, { displayMode });
      setPreviewHtml(html);
      setPreviewError(null);
    } catch (e) {
      setPreviewHtml('');
      setPreviewError((e as Error).message);
    }
  }, [latex, displayMode]);


  const loadGuideAssets = useCallback(async () => {
    setGuideLoading(true);
    try {
      const [guideRes, tableRes] = await Promise.all([fetch(GUIDE_FILE), fetch(TABLE_FILE)]);
      if (!guideRes.ok || !tableRes.ok) {
        throw new Error('Offline KaTeX guide assets are missing.');
      }
      const [guideText, tableText] = await Promise.all([guideRes.text(), tableRes.text()]);
      setGuideMarkdown(sanitizeMarkdown(guideText));
      setGuideTable(sanitizeMarkdown(tableText));
      setGuideError(null);
    } catch (err) {
      setGuideError((err as Error).message || 'Unable to load KaTeX guide.');
    } finally {
      setGuideLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!guideOpen || guideMarkdown) return;
    loadGuideAssets();
  }, [guideOpen, guideMarkdown, loadGuideAssets]);

  const guideSections = useMemo(() => {
    const matches = [...guideMarkdown.matchAll(/^##\s+(.+)$/gm)];
    return matches.map((match) => {
      const label = match[1].trim();
      return { label, id: `guide-${slugify(label)}` };
    });
  }, [guideMarkdown]);

  const filteredGuideSections = useMemo(() => {
    if (!guideSearch.trim()) return guideSections;
    return guideSections.filter((section) =>
      section.label.toLowerCase().includes(guideSearch.toLowerCase())
    );
  }, [guideSections, guideSearch]);

  useEffect(() => {
    highlightedGuideNodesRef.current.forEach((el) =>
      el.classList.remove(...GUIDE_HIGHLIGHT_CLASSES)
    );
    highlightedGuideNodesRef.current = [];

    if (!guideContentRef.current) return;
    const query = guideSearch.trim().toLowerCase();
    if (!query) return;

    // Debounce search to avoid blocking UI - increased debounce time
    const searchTimeout = setTimeout(() => {
      if (!guideContentRef.current) return;
      
      // Use a more efficient approach - search only in headings first
      const headings = guideContentRef.current.querySelectorAll('h2, h3, h4');
      let found = false;
      
      for (const heading of Array.from(headings)) {
        if (found) break;
        const text = heading.textContent?.toLowerCase() ?? '';
        if (text.includes(query)) {
          found = true;
          heading.classList.add(...GUIDE_HIGHLIGHT_CLASSES);
          highlightedGuideNodesRef.current.push(heading as HTMLElement);
          // Use requestAnimationFrame for smooth scrolling
          requestAnimationFrame(() => {
            heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
          break;
        }
      }
      
      // If not found in headings, search in code blocks (syntax examples)
      if (!found) {
        const codeBlocks = guideContentRef.current.querySelectorAll('code');
        for (const code of Array.from(codeBlocks)) {
          if (found) break;
          const text = code.textContent?.toLowerCase() ?? '';
          if (text.includes(query)) {
            found = true;
            const parent = code.closest('td, div, p') as HTMLElement;
            if (parent) {
              parent.classList.add(...GUIDE_HIGHLIGHT_CLASSES);
              highlightedGuideNodesRef.current.push(parent);
              requestAnimationFrame(() => {
                parent.scrollIntoView({ behavior: 'smooth', block: 'center' });
              });
            }
            break;
          }
        }
      }
    }, 500); // Increased debounce time

    return () => clearTimeout(searchTimeout);
  }, [guideSearch]);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      const inside = !!(sel && sel.rangeCount > 0 && ref.current && isDescendant(ref.current, sel.getRangeAt(0).startContainer));
      if (inside) {
        setActive({
          bold: document.queryCommandState('bold'),
          italic: document.queryCommandState('italic'),
          underline: document.queryCommandState('underline'),
        });
        // persist selection for this editor only
        if (sel) selectionRef.current = sel.getRangeAt(0).cloneRange();
      }
    };

    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const restoreSelection = () => {
    const sel = window.getSelection();
    if (!sel) return false;
    sel.removeAllRanges();
    if (selectionRef.current) {
      sel.addRange(selectionRef.current);
      return true;
    }
    // place caret at end of editor
    if (ref.current) {
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      sel.addRange(range);
      selectionRef.current = range.cloneRange();
      return true;
    }
    return false;
  };

  const ensureCaretInEditor = () => {
    const sel = window.getSelection();
    if (!ref.current) return;
    const hasValidSelection = !!(sel && sel.rangeCount > 0 && isDescendant(ref.current, sel.getRangeAt(0).startContainer));
    if (hasValidSelection) return;
    // If editor is empty, insert a zero-width space so formatting toggles can apply at caret
    if (ref.current.innerHTML === '' || ref.current.innerHTML === '<br>' || ref.current.textContent === '') {
      ref.current.innerHTML = '\u200B';
    }
    const range = document.createRange();
    range.selectNodeContents(ref.current);
    range.collapse(false);
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
    selectionRef.current = range.cloneRange();
  };

  const doExec = (cmd: string, value?: string) => {
    if (ref.current) ref.current.focus();
    ensureCaretInEditor();
    restoreSelection();
    document.execCommand(cmd, false, value);
    // update value
    if (ref.current) {
      const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
      if (cleaned !== ref.current.innerHTML) {
        ref.current.innerHTML = cleaned;
        // keep caret at end after cleanup
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(ref.current);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
          selectionRef.current = range.cloneRange();
        }
      }
      onChange(cleaned);
    }
    // immediately refresh active states so toggles reflect current state
    try {
      setActive({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
      });
    } catch (error) {
      // Document command state can throw in unsupported browsers; ignore
    }
  };

  return (
    <TooltipProvider>
      <div className={`tk-richtext-editor space-y-2 ${className || ''}`}>
        <div className="rounded-md border bg-muted/40 px-2 py-1 flex flex-nowrap items-center gap-1 overflow-x-auto">
          <div className="flex gap-1 pr-2 border-r">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant={active.bold ? 'default' : 'ghost'} size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('bold')} aria-label="Bold"><Bold className="h-4 w-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Bold (Ctrl+B)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant={active.italic ? 'default' : 'ghost'} size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('italic')} aria-label="Italic"><Italic className="h-4 w-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Italic (Ctrl+I)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant={active.underline ? 'default' : 'ghost'} size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('underline')} aria-label="Underline"><Underline className="h-4 w-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Underline (Ctrl+U)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('strikeThrough')} aria-label="Strikethrough"><Strikethrough className="h-4 w-4" /></Button>
              </TooltipTrigger>
              <TooltipContent>Strikethrough (Ctrl+S)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} 
                  onClick={() => {
                    if (ref.current) ref.current.focus();
                    ensureCaretInEditor();
                    restoreSelection();
                    // Remove all formatting including background colors from selection
                    const sel = window.getSelection();
                    if (sel && sel.rangeCount > 0) {
                      const range = sel.getRangeAt(0);
                      if (!range.collapsed) {
                        // Get selected text without formatting
                        const text = range.toString();
                        range.deleteContents();
                        const textNode = document.createTextNode(text);
                        range.insertNode(textNode);
                        // Move cursor after inserted text
                        range.setStartAfter(textNode);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        selectionRef.current = range.cloneRange();
                        // Also clear any background colors in the entire editor
                        if (ref.current) {
                          const spans = ref.current.querySelectorAll('[style*="background"]');
                          spans.forEach((el) => {
                            const style = (el as HTMLElement).style;
                            if (style) {
                              style.background = '';
                              style.backgroundColor = '';
                            }
                          });
                          onChange(ref.current.innerHTML);
                        }
                      } else {
                        // If no selection, clear all backgrounds in editor
                        if (ref.current) {
                          const spans = ref.current.querySelectorAll('[style*="background"]');
                          spans.forEach((el) => {
                            const style = (el as HTMLElement).style;
                            if (style) {
                              style.background = '';
                              style.backgroundColor = '';
                            }
                          });
                          onChange(ref.current.innerHTML);
                        }
                      }
                    }
                  }} 
                  aria-label="Remove formatting"
                >
                  <RefreshCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Remove formatting</TooltipContent>
            </Tooltip>
          {enableBlanksButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onMouseDown={(e) => { e.preventDefault(); if (ref.current) ref.current.focus(); restoreSelection(); }}
                  onClick={wrapSelectionAsBlank}
                  aria-label="Make blank"
                >
                  <span className="text-xs font-semibold">BL</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Make blank</TooltipContent>
            </Tooltip>
          )}
        </div>
        {/* Lists removed as requested */}
        {/* Headings removed per requirements */}
        <div className="flex gap-1 px-2 border-r">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('justifyLeft')} aria-label="Align left"><AlignLeft className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Align left</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('justifyCenter')} aria-label="Align center"><AlignCenter className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Align center</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}} onClick={() => doExec('justifyRight')} aria-label="Align right"><AlignRight className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Align right</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex gap-1 pl-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault();}} onClick={() => doExec('undo')} aria-label="Undo"><Undo2 className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Undo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault();}} onClick={() => doExec('redo')} aria-label="Redo"><Redo2 className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Redo</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" onMouseDown={(e)=>{e.preventDefault();}} onClick={clearAllContent} aria-label="Clear all"><Eraser className="h-4 w-4" /></Button>
            </TooltipTrigger>
            <TooltipContent>Clear all</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onMouseDown={(e)=>{e.preventDefault(); if(ref.current) ref.current.focus(); restoreSelection();}}
                onClick={() => {
                  // save current selection inside the editor before opening modal
                  const sel = window.getSelection();
                  if (sel && sel.rangeCount > 0) {
                    selectionRef.current = sel.getRangeAt(0).cloneRange();
                  }
                  setEqOpen(true);
                }}
                aria-label="Insert equation"
              >
                <Sigma className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert equation</TooltipContent>
          </Tooltip>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
              const src = reader.result as string;
              if (ref.current) ref.current.focus();
              restoreSelection();
              insertHtmlAtCursor(`<img src="${src}" alt="" />`);
              if (ref.current) onChange(ref.current.innerHTML);
              if (fileInputRef.current) fileInputRef.current.value = '';
            };
            reader.readAsDataURL(file);
          }} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" variant="ghost" size="icon" aria-label="Insert image" onClick={() => fileInputRef.current?.click()}>
                <ImageIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Insert image</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div
        ref={ref}
        className={`min-h-[120px] rounded-md border p-3 focus:outline-none focus:ring-2 focus:ring-ring prose prose-base max-w-none`}
        contentEditable
        onPaste={async (e) => {
          e.preventDefault();
          
          // Check for image files in clipboard
          const items = e.clipboardData?.items;
          if (items) {
            for (let i = 0; i < items.length; i++) {
              const item = items[i];
              if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (blob) {
                  const reader = new FileReader();
                  reader.onload = () => {
                    const src = reader.result as string;
                    if (ref.current) ref.current.focus();
                    restoreSelection();
                    insertHtmlAtCursor(`<img src="${src}" alt="" />`);
                    if (ref.current) {
                      const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
                      ref.current.innerHTML = cleaned;
                      onChange(cleaned);
                    }
                  };
                  reader.readAsDataURL(blob);
                  return;
                }
              }
            }
          }
          
          // Fallback to text/html or text/plain
          const html = e.clipboardData?.getData('text/html');
          const text = e.clipboardData?.getData('text/plain');
          if (html) {
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            insertHtmlAtCursor(wrapper.innerHTML);
          } else if (text) {
            insertHtmlAtCursor(text);
          }
          if (ref.current) {
            stripBackgroundStyles(ref.current);
            const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
            ref.current.innerHTML = cleaned;
            onChange(cleaned);
          }
        }}
        onInput={(e) => {
          const targetHtml = (e.target as HTMLDivElement).innerHTML;

          if (ref.current) {
            stripBackgroundStyles(ref.current);
            const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
            onChange(cleaned);
          } else {
            const cleaned = targetHtml.replace(/\u200B/g, '');
            onChange(cleaned);
          }
        }}
        onFocus={() => {
          // ensure a valid caret inside this editor when focusing via toolbar click
          const sel = window.getSelection();
          if (sel && ref.current && !(sel.rangeCount && isDescendant(ref.current, sel.getRangeAt(0).startContainer))) {
            const range = document.createRange();
            range.selectNodeContents(ref.current);
            range.collapse(false);
            sel.removeAllRanges();
            sel.addRange(range);
            selectionRef.current = range.cloneRange();
          }
        }}
        onBlur={() => {
          // strip zero-width placeholders on blur to avoid saving them
          if (ref.current) {
            const cleaned = ref.current.innerHTML.replace(/\u200B/g, '');
            if (cleaned !== ref.current.innerHTML) {
              ref.current.innerHTML = cleaned;
              onChange(cleaned);
            }
          }
        }}
        onKeyDown={(e) => {
          // Keyboard shortcuts for formatting
          if (e.ctrlKey || e.metaKey) {
            if (e.key === 'b') {
              e.preventDefault();
              doExec('bold');
            } else if (e.key === 'i') {
              e.preventDefault();
              doExec('italic');
            } else if (e.key === 'u') {
              e.preventDefault();
              doExec('underline');
            } else if (e.key === 's' && !e.shiftKey) {
              e.preventDefault();
              doExec('strikeThrough');
            }
          }
          // Fix paragraph break after katex equation
          if (e.key === 'Enter') {
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0 && ref.current) {
              const range = sel.getRangeAt(0);
              const container = range.startContainer;
              
              // Check if we're inside or immediately after a katex element
              let currentNode: Node | null = container.nodeType === Node.TEXT_NODE ? container.parentNode : container;
              let katexElement: HTMLElement | null = null;
              
              // Find if we're inside a katex element
              while (currentNode && currentNode !== ref.current) {
                if (currentNode.nodeType === Node.ELEMENT_NODE) {
                  const el = currentNode as HTMLElement;
                  if (el.classList && (el.classList.contains('katex') || el.classList.contains('katex-display'))) {
                    katexElement = el;
                    break;
                  }
                }
                currentNode = currentNode.parentNode;
              }
              
              // If we're inside a katex element, prevent default and insert paragraph after it
              if (katexElement && katexElement.parentNode) {
                e.preventDefault();
                // Find the outermost katex container
                while (katexElement.parentNode && katexElement.parentNode !== ref.current) {
                  const parent = katexElement.parentNode as HTMLElement;
                  if (parent.classList && (parent.classList.contains('katex') || parent.classList.contains('katex-display'))) {
                    katexElement = parent;
                  } else {
                    break;
                  }
                }
                
                // Insert a new paragraph after the katex element
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                if (katexElement.nextSibling) {
                  katexElement.parentNode.insertBefore(p, katexElement.nextSibling);
                } else {
                  katexElement.parentNode.appendChild(p);
                }
                
                // Move cursor to the new paragraph
                const newRange = document.createRange();
                newRange.setStart(p, 0);
                newRange.collapse(true);
                sel.removeAllRanges();
                sel.addRange(newRange);
                selectionRef.current = newRange.cloneRange();
                
                if (ref.current) {
                  onChange(ref.current.innerHTML);
                }
              }
            }
          }
        }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
        tabIndex={0}
      />

      <Dialog open={eqOpen} onOpenChange={(open) => {
        setEqOpen(open);
        if (!open) {
          setEditingKatexElement(null);
          setLatex('');
          setEqPreviewOpen(false);
        }
      }}>
        <DialogContent
          aria-describedby={undefined}
          className="w-[96vw] max-w-4xl h-[86vh] flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-background via-muted/20 to-background shadow-2xl"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            requestAnimationFrame(() => {
              equationInputRef.current?.focus();
            });
          }}
        >
          <DialogHeader className="pb-5 border-b flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-2xl tracking-tight">{editingKatexElement ? 'Edit Equation' : 'Insert Equation'}</DialogTitle>
                <DialogDescription>
                  Type your KaTeX/LaTeX syntax here. Use the preview icon to open the rendered equation in a separate modal.
                </DialogDescription>
              </div>
              {/* Top Navigation Bar - Icon Only Buttons with Colors */}
              <div className="flex flex-wrap items-center gap-2 bg-muted/30 rounded-2xl px-3 py-2 border border-border/50 shadow-sm">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setLibraryOpen(true);
                      }}
                      className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      <Library className="h-4 w-4 text-primary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open Syntax Library</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setReturnToEquationAfterGuide(true);
                        setGuideOpen(true);
                      }}
                      className="h-9 w-9 hover:bg-purple-500/10 hover:text-purple-500 transition-colors"
                    >
                      <BookOpen className="h-4 w-4 text-purple-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open KaTeX Guide</TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-border mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setEqPreviewOpen(true)}
                      className="h-9 w-9 hover:bg-primary/10 hover:text-primary transition-colors"
                      aria-label="Open equation preview"
                    >
                      <Eye className="h-4 w-4 text-primary" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Open Preview</TooltipContent>
                </Tooltip>
                <div className="h-5 w-px bg-border mx-1" />
                <div className="flex items-center gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={!displayMode ? 'default' : 'outline'}
                        className="h-9 w-9"
                        onClick={() => setDisplayMode(false)}
                      >
                        <span className="text-[10px] font-semibold">In</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Inline layout</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        size="icon"
                        variant={displayMode ? 'default' : 'outline'}
                        className="h-9 w-9"
                        onClick={() => setDisplayMode(true)}
                      >
                        <span className="text-[10px] font-semibold">Bl</span>
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Block layout</TooltipContent>
                  </Tooltip>
                </div>
                <div className="h-5 w-px bg-border mx-1" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={!latex}
                      onClick={async () => {
                        if (!latex) return;
                        try {
                          await navigator.clipboard.writeText(latex);
                          toast.success('LaTeX copied to clipboard');
                        } catch {
                          toast.error('Failed to copy LaTeX');
                        }
                      }}
                      className="h-9 w-9 hover:bg-green-500/10 hover:text-green-500 transition-colors disabled:opacity-50"
                    >
                      <Copy className="h-4 w-4 text-green-500" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy LaTeX</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </DialogHeader>
          <div className="flex-1 min-h-0 p-5">
            <div className="flex flex-col h-full min-h-0 rounded-3xl border border-border/60 bg-card/80 p-5 shadow-xl">
              <div className="flex flex-col min-h-0 flex-1 bg-muted/20 rounded-2xl p-4 border border-border/60 shadow-inner">
                <label className="block text-sm font-semibold text-foreground mb-2">LaTeX Input</label>
                <textarea
                  ref={equationInputRef}
                  value={latex}
                  onChange={(e) => setLatex(e.target.value)}
                  className="flex-1 min-h-0 w-full rounded-2xl border border-border/70 bg-background/90 p-4 text-[15px] font-mono leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-ring/70 resize-none shadow-sm"
                  placeholder="Type or paste LaTeX… e.g. \\int_{a}^{b} x^2 \\, dx"
                />
                {previewError && (
                  <div className="mt-3 text-sm font-medium text-destructive bg-destructive/10 p-3 rounded-lg border border-destructive/30">
                    {previewError}
                  </div>
                )}
              </div>
            </div>
          </div>
          <DialogFooter className="flex flex-wrap gap-2 flex-shrink-0 border-t pt-4 mt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setLatex('');
                setPreviewHtml('');
                setPreviewError(null);
                setEqOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!latex.trim() || !!previewError}
              onClick={() => handleInsertEquation(true)}
            >
              Insert equation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={eqPreviewOpen} onOpenChange={setEqPreviewOpen}>
        <DialogContent
          aria-describedby={undefined}
          hideClose
          className="w-[96vw] max-w-4xl h-[85vh] flex flex-col overflow-hidden rounded-3xl border border-border/70 bg-background shadow-2xl p-0"
        >
          <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-border/70">
            <div className="flex items-center gap-3">
              <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Scale</div>
              <input
                type="range"
                min={80}
                max={160}
                value={previewScale}
                onChange={(e) => setPreviewScale(Number(e.target.value))}
                className="w-56 accent-primary"
              />
              <span className="text-xs font-mono text-muted-foreground">{previewScale}%</span>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setEqPreviewOpen(false)} aria-label="Close preview">
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="flex-1 min-h-0 overflow-auto show-scrollbar p-6 content-html">
            {previewError && (
              <div className="text-sm font-medium text-destructive bg-destructive/10 p-4 rounded-xl border border-destructive/30">
                {previewError}
              </div>
            )}
            {!previewError && previewHtml && (
              <div
                className="inline-block"
                style={{ transform: `scale(${previewScale / 100})`, transformOrigin: 'top left' }}
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            )}
            {!previewError && !previewHtml && (
              <div className="text-sm text-muted-foreground">
                <Sigma className="h-10 w-10 mb-2 opacity-20" />
                <p>Nothing to preview yet</p>
                <p className="text-xs mt-1">Type LaTeX in the equation editor</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Syntax Editor Modal - For editing placeholders */}
      <Dialog open={syntaxEditorOpen} onOpenChange={setSyntaxEditorOpen}>
        <DialogContent className="w-[90vw] max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>Edit Syntax Values</DialogTitle>
            <DialogDescription>
              Customize the values for {editingSyntax?.label || 'this syntax'}
            </DialogDescription>
          </DialogHeader>
          {editingSyntax && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-sm font-mono text-muted-foreground mb-2">Original syntax:</p>
                <p className="text-base font-mono text-foreground">{editingSyntax.snippet}</p>
              </div>
              <div className="space-y-3">
                {Object.keys(syntaxPlaceholders).map((placeholder) => (
                  <div key={placeholder} className="space-y-2">
                    <Label htmlFor={`placeholder-${placeholder}`} className="text-sm font-medium">
                      Value for <code className="px-1.5 py-0.5 rounded bg-muted text-xs">{placeholder}</code>:
                    </Label>
                    <Input
                      id={`placeholder-${placeholder}`}
                      value={syntaxPlaceholders[placeholder]}
                      onChange={(e) => {
                        setSyntaxPlaceholders((prev) => ({
                          ...prev,
                          [placeholder]: e.target.value,
                        }));
                      }}
                      placeholder={`Enter value for ${placeholder}`}
                      className="font-mono"
                    />
                  </div>
                ))}
              </div>
              <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium mb-2">Preview:</p>
                <p className="text-base font-mono text-foreground">
                  {replacePlaceholders(editingSyntax.snippet, syntaxPlaceholders)}
                </p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSyntaxEditorOpen(false);
                setEditingSyntax(null);
                setSyntaxPlaceholders({});
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (editingSyntax) {
                  const finalSyntax = replacePlaceholders(editingSyntax.snippet, syntaxPlaceholders);
                  insertSyntaxDirectly(finalSyntax);
                  setSyntaxEditorOpen(false);
                  setEditingSyntax(null);
                  setSyntaxPlaceholders({});
                }
              }}
            >
              Insert into Equation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Syntax Library Modal */}
      <Dialog open={libraryOpen} onOpenChange={setLibraryOpen}>
        <DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden border border-border bg-background">
          <DialogHeader>
            <DialogTitle>KaTeX Syntax Library</DialogTitle>
            <DialogDescription>
              Browse all available KaTeX syntaxes. Click any syntax to insert it into the equation editor.
            </DialogDescription>
          </DialogHeader>
          <div className="flex h-[70vh] flex-col gap-6">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="flex items-center gap-2 flex-1 rounded-xl border border-border/70 bg-muted/40 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground" />
                <Input
                  value={snippetSearch}
                  onChange={(e) => setSnippetSearch(e.target.value)}
                  placeholder="Search syntaxes…"
                  className="h-8 text-sm border-0 bg-transparent px-0 focus-visible:ring-0"
                />
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-4 min-h-0 lg:flex-row">
              <aside className="lg:w-60 flex-shrink-0 rounded-2xl border border-border/60 bg-muted/30 p-3 space-y-2 max-h-full overflow-y-auto show-scrollbar">
                {syntaxCategories.length ? (
                  syntaxCategories.map((category) => {
                    const isActive = activeSyntaxCategory === category;
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => handleSyntaxCategoryClick(category)}
                        className={`w-full rounded-xl border px-3 py-2 text-left text-sm font-medium flex items-center justify-between transition ${
                          isActive
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border/50 bg-background/80 text-foreground hover:border-primary/40'
                        }`}
                      >
                        <span className="truncate">{category}</span>
                        <span className="text-xs text-muted-foreground">
                          {syntaxCategoryCounts[category] ?? 0}
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">No categories available</p>
                )}
              </aside>
              <div
                ref={syntaxScrollRef}
                className="flex-1 overflow-y-auto space-y-5 pr-2 min-h-[500px] show-scrollbar rounded-2xl border border-dashed border-border/50 bg-background/60 p-3"
              >
                {syntaxLibraryContent}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={guideOpen}
        onOpenChange={(open) => {
          setGuideOpen(open);
          if (!open && returnToEquationAfterGuide) {
            setReturnToEquationAfterGuide(false);
            setEqOpen(true);
            requestAnimationFrame(() => equationInputRef.current?.focus());
          }
        }}
      >
        <DialogContent className="w-[96vw] max-w-6xl max-h-[90vh] overflow-hidden border border-border bg-background">
          <DialogHeader>
            <DialogTitle>KaTeX Offline Reference</DialogTitle>
            <DialogDescription>
              Full list of supported functions bundled with the app. No internet connection required.
            </DialogDescription>
          </DialogHeader>
          {guideLoading ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Loading documentation…</p>
            </div>
          ) : guideError ? (
            <div className="flex h-[60vh] flex-col items-center justify-center gap-4 text-center">
              <p className="text-lg font-semibold text-destructive">{guideError}</p>
              <Button variant="outline" onClick={loadGuideAssets}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="flex h-[70vh] flex-col gap-6 lg:flex-row">
              <div className="lg:w-64 lg:flex-shrink-0 rounded-xl border bg-card/90 p-4 space-y-4 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-md border bg-background px-3 py-1.5 shadow-inner">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <Input
                      value={guideSearch}
                      onChange={(e) => setGuideSearch(e.target.value)}
                      placeholder="Search or filter sections…"
                      className="h-8 border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setGuideSearch('')}
                    disabled={!guideSearch.trim()}
                  >
                    Clear
                  </Button>
                </div>
                <div className="max-h-[55vh] overflow-y-auto space-y-2 pr-1">
                  {filteredGuideSections.length ? (
                    filteredGuideSections.map((section) => (
                      <Button
                        key={section.id}
                        type="button"
                        variant="ghost"
                        className="w-full justify-start text-left"
                        onClick={() => scrollGuideTo(section.id)}
                      >
                        {section.label}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">No sections match that filter.</p>
                  )}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-4 lg:flex-row">
                <div
                  ref={guideContentRef}
                  className="flex-1 overflow-y-auto overflow-x-hidden rounded-xl border bg-card p-4 prose prose-slate max-w-none shadow-sm"
                  style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={guideMarkdownComponents}
                  >
                    {guideMarkdown}
                  </ReactMarkdown>
                </div>
                <div className="lg:w-80 overflow-y-auto overflow-x-hidden rounded-xl border bg-card p-4 prose prose-sm max-w-none shadow-sm"
                  style={{ wordWrap: 'break-word', overflowWrap: 'break-word' }}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={guideMarkdownComponents}
                  >
                    {guideTable}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      </div>
    </TooltipProvider>
  );
}
