import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: string | ReactNode;
  subtitle?: string;
  icon?: ReactNode;
  className?: string;
}

export function StatCard({ label, value, subtitle, icon, className }: StatCardProps) {
  return (
    <div className={cn('bg-gray-50 rounded-lg p-4 border border-gray-200', className)}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          {subtitle && <p className="mt-1 text-xs text-gray-500">{subtitle}</p>}
        </div>
        {icon && <div className="ml-4 text-gray-400">{icon}</div>}
      </div>
    </div>
  );
}
