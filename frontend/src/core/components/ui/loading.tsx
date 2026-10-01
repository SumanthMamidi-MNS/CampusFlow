import * as React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SpinnerProps extends React.SVGAttributes<SVGSVGElement> {
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const sizeClasses = {
  sm: 'h-4 w-4',
  md: 'h-6 w-6',
  lg: 'h-8 w-8',
  xl: 'h-12 w-12',
};

const Spinner = ({ className, size = 'md', ...props }: SpinnerProps) => {
  return (
    <Loader2
      className={cn('animate-spin text-blue-600', sizeClasses[size], className)}
      {...props}
    />
  );
};

export interface PageLoadingProps extends React.HTMLAttributes<HTMLDivElement> {
  message?: string;
}

const PageLoading = ({ className, message, ...props }: PageLoadingProps) => {
  return (
    <div
      className={cn('flex min-h-[400px] flex-col items-center justify-center w-full', className)}
      {...props}
    >
      <Spinner size="lg" />
      {message && <p className="mt-4 text-sm text-slate-500">{message}</p>}
    </div>
  );
};

const Skeleton = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-slate-200/60', className)}
      {...props}
    />
  );
};

export { Spinner, PageLoading, Skeleton };
