import { toast } from 'sonner';

export async function copyTextToClipboard(text: string, successMessage = 'Copied to clipboard!') {
  const value = (text || '').trim();
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage, {
      duration: 2000,
    });
  } catch (_err) {
    const textArea = document.createElement('textarea');
    textArea.value = value;
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    textArea.style.pointerEvents = 'none';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      toast.success(successMessage, {
        duration: 2000,
      });
    } catch (_fallbackErr) {
      toast.error('Failed to copy', {
        duration: 2000,
      });
    }
    document.body.removeChild(textArea);
  }
}

/**
 * Sets up click-to-copy functionality for all code and pre elements
 * Call this function after content is rendered
 */
export function setupCodeBlockCopy() {
  const handleCodeClick = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const codeElement = target.closest('code, pre') as HTMLElement;
    
    if (!codeElement) return;

    // Check if we're in a select-none context (quiz page) - allow copying code even there
    // But prevent default copy behavior from being blocked
    const isInQuizPage = codeElement.closest('.select-none');
    
    // Get text content from the code element
    const textToCopy = codeElement.textContent || codeElement.innerText || '';
    
    if (!textToCopy.trim()) return;

    // Stop event propagation to prevent other handlers
    e.stopPropagation();

    await copyTextToClipboard(textToCopy, 'Code copied to clipboard!');
  };

  // Use event delegation on document body
  document.body.addEventListener('click', handleCodeClick, true); // Use capture phase
}

