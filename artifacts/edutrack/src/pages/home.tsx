import { Link } from "wouter";

export default function Home() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-6 py-4 flex justify-between items-center bg-white border-b border-border shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-white font-bold text-lg">
            E
          </div>
          <span className="text-xl font-semibold text-foreground">EduTrack</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/sign-in" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Link href="/sign-up" className="text-sm font-medium bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 transition-colors">
            Get Started
          </Link>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="max-w-3xl space-y-6">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground">
            The control room for <span className="text-primary">tutors & coaches</span>.
          </h1>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
            Manage students, classes, attendance, assessments, and billing all from one calm, organized, and information-dense dashboard. Professional grade software for your business.
          </p>
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Link href="/sign-up" className="text-base font-medium bg-primary text-primary-foreground px-6 py-3 rounded-md hover:bg-primary/90 transition-colors">
              Start Free Trial
            </Link>
            <Link href="/sign-in" className="text-base font-medium bg-white text-foreground border border-border px-6 py-3 rounded-md hover:bg-muted transition-colors">
              Sign In
            </Link>
          </div>
        </div>
      </main>
      
      <footer className="py-6 text-center text-sm text-muted-foreground border-t border-border bg-white">
        © {new Date().getFullYear()} EduTrack. All rights reserved.
      </footer>
    </div>
  );
}
