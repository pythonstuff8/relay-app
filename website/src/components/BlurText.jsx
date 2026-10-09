import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';

function variantFromDirection(direction) {
  switch (direction) {
    case 'top':
      return { hidden: { filter: 'blur(10px)', opacity: 0, y: -50 } };
    case 'left':
      return { hidden: { filter: 'blur(10px)', opacity: 0, x: -50 } };
    case 'right':
      return { hidden: { filter: 'blur(10px)', opacity: 0, x: 50 } };
    default:
      return { hidden: { filter: 'blur(10px)', opacity: 0, y: 50 } };
  }
}

export default function BlurText({
  text,
  className = '',
  by = 'words',
  delay = 100,
  direction = 'bottom',
  as: Tag = 'h1'
}) {
  const [inView, setInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const pieces = useMemo(() => {
    if (!text) return [];
    return by === 'letters' ? text.split('') : text.split(' ');
  }, [text, by]);

  const directional = variantFromDirection(direction);

  return (
    <Tag ref={ref} className={className}>
      {pieces.map((piece, idx) => (
        <motion.span
          key={`${piece}-${idx}`}
          initial={directional.hidden}
          animate={inView ? { filter: 'blur(0px)', opacity: 1, y: 0, x: 0 } : directional.hidden}
          transition={{
            duration: 0.35,
            delay: (delay / 1000) * idx,
            times: [0, 0.5, 1],
            ease: 'easeOut'
          }}
          style={{ display: 'inline-block', whiteSpace: 'pre' }}
        >
          {by === 'letters' ? piece : `${piece}${idx < pieces.length - 1 ? ' ' : ''}`}
        </motion.span>
      ))}
    </Tag>
  );
}
