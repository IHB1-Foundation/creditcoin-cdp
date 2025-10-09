'use client';

import { Header } from '@/components/Header';
import { OracleInfo } from '@/components/OracleInfo';
import { VaultCard } from '@/components/VaultCard';
import { StabilityPoolCard } from '@/components/StabilityPoolCard';
import { RedemptionCard } from '@/components/RedemptionCard';

export default function Home() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <Header />

      <main className="container mx-auto px-4 py-8">
        {/* System Info */}
        <div className="mb-8">
          <OracleInfo />
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Left Column */}
          <div className="space-y-8">
            <VaultCard />
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            <RedemptionCard />
            <StabilityPoolCard />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-16 text-center text-sm text-gray-600 pb-8">
          <p>Credit CDP Protocol • Built for London EVM • CreditCoin Testnet</p>
          <p className="mt-2">
            <a
              href="https://github.com/your-repo"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700"
            >
              GitHub
            </a>
            {' • '}
            <a
              href="/docs"
              className="text-primary-600 hover:text-primary-700"
            >
              Documentation
            </a>
          </p>
        </footer>
      </main>
    </div>
  );
}
