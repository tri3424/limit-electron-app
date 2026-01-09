import { useEffect } from 'react';
import { toast } from 'sonner';

/**
 * Hook to add click-to-copy functionality to code blocks (code and pre elements)
 * within a container element
 */
export function useCodeBlockCopy(containerRef: React.RefObject<HTMLElement> | null) {
  useEffect(() => {
    if (!containerRef?.current) return;

    const container = containerRef.current;
    const codeElements = container.querySelectorAll('code, pre');

    const handleCodeClick = async (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const codeElement = target.closest('code, pre') as HTMLElement;
      
      if (!codeElement) return;

      // Get text content from the code element
      const textToCopy = codeElement.textContent || codeElement.innerText || '';
      
      if (!textToCopy.trim()) return;

      try {
        await navigator.clipboard.writeText(textToCopy);
        toast.success('Code copied to clipboard!', {
          duration: 2000,
        });
      } catch (err) {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        try {
          document.execCommand('copy');
          toast.success('Code copied to clipboard!', {
            duration: 2000,
          });
        } catch (fallbackErr) {
          toast.error('Failed to copy code', {
            duration: 2000,
          });
        }
        document.body.removeChild(textArea);
      }
    };

    codeElements.forEach((element) => {
      element.style.cursor = 'pointer';
      element.setAttribute('title', 'Click to copy');
      element.addEventListener('click', handleCodeClick);
    });

    return () => {
      codeElements.forEach((element) => {
        element.removeEventListener('click', handleCodeClick);
      });
    };
  }, [containerRef]);
}

