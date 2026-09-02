"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ArrowLeft, MapPin, Phone, Compass, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { customerService, Branch } from '@/services/customerService';
import { ApiError } from '@/lib/apiClient';

export default function BranchLocatorPage() {
  const router = useRouter();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');

  const loadBranches = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const list = await customerService.getBranches();
      setBranches(list);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not load branches.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBranches();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return branches;
    return branches.filter(
      (b) => b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)
    );
  }, [branches, query]);

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push('/customer')}
          className="w-8 h-8 rounded-full bg-white border border-slate-line flex items-center justify-center text-slate hover:border-gold"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display font-bold text-base text-ink">
          Branch Locator
        </h1>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-muted" />
        <Input
          placeholder="Search by branch name or area"
          className="pl-10"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {/* Loading state */}
      {loading && (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      )}

      {/* Load error */}
      {!loading && loadError && (
        <Card className="p-4 border-red-200 bg-red-50/60">
          <p className="text-xs font-medium text-red-700">{loadError}</p>
          <Button size="sm" variant="outline" className="mt-3" onClick={loadBranches}>
            Retry
          </Button>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !loadError && branches.length === 0 && (
        <EmptyState
          icon={<MapPin className="h-7 w-7 text-gold" />}
          title="No branches available"
          description="Your store hasn't listed any branches yet. Please check back later."
        />
      )}

      {/* No search results */}
      {!loading && !loadError && branches.length > 0 && filtered.length === 0 && (
        <EmptyState
          icon={<Search className="h-7 w-7 text-gold" />}
          title="No matching branches"
          description={`Nothing found for "${query}". Try a different search.`}
        />
      )}

      {/* Branch list */}
      {!loading && !loadError && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map((branch) => (
            <Card key={branch.id} className="p-4 border-slate-line bg-white shadow-card">
              <CardContent className="p-0 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-extrabold text-sm text-ink">
                    {branch.name}
                  </h3>
                  <Badge variant="success" className="text-[10px]">Active</Badge>
                </div>

                <p className="text-xs text-slate-muted leading-relaxed flex items-start gap-1.5">
                  <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5 text-gold" />
                  {branch.address}
                </p>

                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-line">
                  <Button
                    onClick={() => (window.location.href = `tel:${branch.phone}`)}
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                  >
                    <Phone className="h-3.5 w-3.5 mr-1.5 text-gold" /> Call
                  </Button>

                  <Button
                    onClick={() => window.open(branch.mapsUrl, '_blank', 'noopener,noreferrer')}
                    size="sm"
                    className="w-full text-xs shadow-glow"
                  >
                    <Compass className="h-3.5 w-3.5 mr-1.5" /> Directions
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
