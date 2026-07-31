import { motion } from 'framer-motion';

interface CommandSnippetProps {
  command: string;
  description: string;
  delay?: number;
}

export function CommandSnippet({ command, description, delay = 0 }: CommandSnippetProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: "-100px" }}
      transition={{ duration: 0.5, delay }}
      className="group"
    >
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-1 h-1 rounded-full bg-primary" />
          <code className="font-mono text-sm sm:text-base text-primary font-medium tracking-tight">
            {command}
          </code>
        </div>
        <p className="text-muted-foreground text-sm sm:text-base ml-4 leading-relaxed">
          {description}
        </p>
      </div>
    </motion.div>
  );
}
