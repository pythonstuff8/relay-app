import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

export default function ShinyText({
  text,
  className,
  baseColor = '#64CEFB',
  shineColor = '#ffffff',
  duration = 3,
  spread = 100
}) {
  const gradient = `linear-gradient(${spread}deg, ${baseColor} 0%, ${baseColor} 38%, ${shineColor} 50%, ${baseColor} 62%, ${baseColor} 100%)`;

  return (
    <motion.span
      className={cn('inline-block bg-clip-text text-transparent align-baseline overflow-visible', className)}
      style={{
        backgroundImage: gradient,
        backgroundSize: '240% 100%',
        backgroundPosition: '200% 50%',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        lineHeight: 1.12,
        paddingBottom: '0.12em'
      }}
      animate={{
        backgroundPosition: ['200% 50%', '-40% 50%']
      }}
      transition={{
        duration,
        ease: 'linear',
        repeat: Infinity
      }}
    >
      {text}
    </motion.span>
  );
}
