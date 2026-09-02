import React from 'react';
import { Search, Filter, Plus, FileText, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface PlaceholderPageProps {
  title: string;
  description: string;
  breadcrumbs: string[];
}

export const PlaceholderPage: React.FC<PlaceholderPageProps> = ({ title, description, breadcrumbs }) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <LayoutDashboard className="w-4 h-4" />
        {breadcrumbs.map((crumb, idx) => (
          <React.Fragment key={idx}>
            <span>/</span>
            <span className={idx === breadcrumbs.length - 1 ? 'text-slate-900 font-bold' : ''}>
              {crumb}
            </span>
          </React.Fragment>
        ))}
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-sm text-slate-500 mt-1">{description}</p>
        </div>
        <Button className="bg-gold hover:bg-gold-dark text-white font-bold px-5 h-10 shadow-md transition-all hidden sm:flex">
          <Plus className="w-4 h-4 mr-2" />
          Create New
        </Button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input 
            placeholder={`Search ${title.toLowerCase()}...`}
            className="pl-9 bg-slate-50 border-slate-200"
          />
        </div>
        <Button variant="outline" className="border-slate-200 text-slate-600 bg-white hover:bg-slate-50">
          <Filter className="w-4 h-4 mr-2" />
          Filters
        </Button>
      </div>

      {/* Table & Empty State */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">ID</th>
                <th className="px-6 py-4">Name</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* Empty state spans all columns */}
              <tr>
                <td colSpan={5} className="px-6 py-16 text-center">
                  <div className="flex flex-col items-center justify-center max-w-sm mx-auto">
                    <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-100 mb-4 shadow-inner">
                      <FileText className="w-8 h-8 text-slate-300" />
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">No {title.toLowerCase()} found</h3>
                    <p className="text-sm text-slate-500 mb-6 text-center">
                      Get started by creating a new record. Your data will securely appear here once created.
                    </p>
                    <Button className="bg-gold hover:bg-gold-dark text-white font-bold shadow-md transition-all">
                      <Plus className="w-4 h-4 mr-2" />
                      Create First Record
                    </Button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        {/* Mock Pagination Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 font-medium">
          <div>Showing 0 to 0 of 0 entries</div>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled className="h-8">Previous</Button>
            <Button variant="outline" size="sm" disabled className="h-8">Next</Button>
          </div>
        </div>
      </div>
    </div>
  );
};
