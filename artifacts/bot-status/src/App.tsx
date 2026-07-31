import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';
import { motion } from 'framer-motion';
import { Copy, Server, Zap, Shield, Database, ArrowRight, Terminal, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CommandSnippet } from '@/components/command-snippet';
import { FeatureCard } from '@/components/feature-card';

const queryClient = new QueryClient();

function Home() {
  return (
    <div className="min-h-[100dvh] w-full bg-background">
      {/* Hero Section */}
      <section className="relative min-h-[100dvh] flex items-center justify-center overflow-hidden">
        {/* Ambient background gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent pointer-events-none" />
        
        {/* Grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(hsl(var(--border)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border)) 1px, transparent 1px)`,
          backgroundSize: '50px 50px'
        }} />

        <div className="relative z-10 max-w-6xl mx-auto px-6 sm:px-8 py-20 text-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8"
          >
            <Terminal className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Discord Server Cloning Tool</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-bold mb-6 tracking-tight"
          >
            <span className="bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-transparent">
              CopiEX
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-xl sm:text-2xl md:text-3xl text-muted-foreground mb-12 max-w-3xl mx-auto leading-relaxed"
          >
            Clone entire Discord servers with two slash commands. Channels, roles, permissions — everything.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16"
          >
            <Button size="xl" className="group font-semibold">
              Add to Discord
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button size="xl" variant="outline" className="font-semibold">
              View Documentation
            </Button>
          </motion.div>

          {/* Command preview */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="max-w-2xl mx-auto bg-card border border-card-border rounded-lg p-6 sm:p-8 shadow-xl"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-3 h-3 rounded-full bg-destructive" />
              <div className="w-3 h-3 rounded-full bg-chart-4" />
              <div className="w-3 h-3 rounded-full bg-chart-5" />
            </div>
            <div className="text-left space-y-3">
              <div className="font-mono text-sm sm:text-base">
                <span className="text-primary">/copy-server</span>
                <span className="text-muted-foreground"> name:</span>
                <span className="text-foreground">production-backup</span>
              </div>
              <div className="h-px bg-border" />
              <div className="text-muted-foreground text-sm">
                Snapshot saved. 47 channels, 23 roles, all permissions preserved.
              </div>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 border-2 border-muted-foreground/30 rounded-full flex items-start justify-center p-2">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 bg-primary rounded-full"
            />
          </div>
        </motion.div>
      </section>

      {/* Commands Section */}
      <section className="relative py-24 sm:py-32 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Three commands. Total control.
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Professional server management with the precision you expect from a developer tool.
            </p>
          </motion.div>

          <div className="space-y-8 sm:space-y-10">
            <CommandSnippet
              command="/copy-server name:<label>"
              description="Snapshots your entire server structure: channels, categories, roles, permissions, server icon, and description. Everything preserved exactly as configured."
              delay={0}
            />
            <CommandSnippet
              command="/import-server name:<label> confirm:CONFIRM [archive:True]"
              description="Applies a saved snapshot to any server. Archive mode moves existing channels to a hidden folder instead of deleting them — perfect for safe migrations."
              delay={0.1}
            />
            <CommandSnippet
              command="/delete-snapshot name:<label>"
              description="Removes a saved snapshot when you no longer need it. Clean up old backups with a single command."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="relative py-24 sm:py-32 px-6 sm:px-8 bg-gradient-to-b from-transparent via-primary/[0.02] to-transparent">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Built for serious admins
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              Every feature designed for server owners who need reliability and precision.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Copy}
              title="Complete Cloning"
              description="Channels, categories, roles, permissions, icons — everything is captured and preserved with perfect fidelity."
              delay={0}
            />
            <FeatureCard
              icon={Zap}
              title="Instant Execution"
              description="No waiting. Commands execute in seconds, not minutes. Your time is valuable."
              delay={0.1}
            />
            <FeatureCard
              icon={Shield}
              title="Safe Archive Mode"
              description="Archive mode preserves existing channels instead of deleting them. Migrate with confidence."
              delay={0.2}
            />
            <FeatureCard
              icon={Database}
              title="Multiple Snapshots"
              description="Save unlimited snapshots with custom labels. Manage backups for different environments and use cases."
              delay={0}
            />
            <FeatureCard
              icon={Server}
              title="Cross-Server Ready"
              description="Apply any snapshot to any server. Perfect for spinning up test environments or duplicating community structures."
              delay={0.1}
            />
            <FeatureCard
              icon={Clock}
              title="Point-in-Time Recovery"
              description="Snapshot before major changes. Roll back instantly if something goes wrong. Your safety net."
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Use Cases Section */}
      <section className="relative py-24 sm:py-32 px-6 sm:px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-4">
              Scenarios we solve
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-card border border-card-border rounded-lg p-8"
            >
              <h3 className="text-xl font-semibold mb-3">Disaster Recovery</h3>
              <p className="text-muted-foreground leading-relaxed">
                Server compromised? Accidentally deleted critical channels? Restore from your last snapshot in under a minute. Zero downtime, zero data loss.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="bg-card border border-card-border rounded-lg p-8"
            >
              <h3 className="text-xl font-semibold mb-3">Staging Environments</h3>
              <p className="text-muted-foreground leading-relaxed">
                Test new channel structures, role hierarchies, and permission schemes in a separate server before deploying to production. No more risky live changes.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-card border border-card-border rounded-lg p-8"
            >
              <h3 className="text-xl font-semibold mb-3">Multi-Community Networks</h3>
              <p className="text-muted-foreground leading-relaxed">
                Running multiple communities with similar structures? Clone your proven setup to new servers instantly. Maintain consistency across your network.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="bg-card border border-card-border rounded-lg p-8"
            >
              <h3 className="text-xl font-semibold mb-3">Server Migrations</h3>
              <p className="text-muted-foreground leading-relaxed">
                Moving to a new server? Archive existing channels, import your structure, and transition smoothly. Members join the new space, and nothing is lost.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 sm:py-32 px-6 sm:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold mb-6">
              Ready to take control?
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Add CopiEX to your server and start cloning in under 30 seconds. No configuration required.
            </p>
            <Button size="xl" className="group font-semibold">
              Add to Discord
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-12 px-6 sm:px-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <Terminal className="w-5 h-5 text-primary" />
              <span className="font-bold text-lg">CopiEX</span>
            </div>
            <div className="flex gap-8 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Documentation</a>
              <a href="#" className="hover:text-foreground transition-colors">Support</a>
              <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
              <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
