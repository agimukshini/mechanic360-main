import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { api } from '@/api'
import {
  Store, Plus, Search, Filter, MapPin, Phone, Mail, MessageCircle,
  Edit2, Trash2, Tag
} from 'lucide-react'
import { useState } from 'react'

const CATEGORIES = [
  { value: 'parts', label: 'Parts' },
  { value: 'tools', label: 'Tools' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'other', label: 'Other' },
]

export default function MarketplaceList() {
  const queryClient = useQueryClient()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  const { data: listingsData, isLoading } = useQuery({
    queryKey: ['marketplace', searchTerm, selectedCategory],
    queryFn: () => {
      const params: any = {}
      if (searchTerm) params.search = searchTerm
      if (selectedCategory) params.category = selectedCategory
      return api.get('/marketplace/', { params })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/marketplace/${id}/`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['marketplace'] })
      setDeleteConfirm(null)
    },
  })

  const listings = listingsData?.data?.results || listingsData?.data || []

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-workshop-charcoal">Marketplace</h1>
          <p className="text-workshop-charcoal/60 mt-1">
            Buy and sell parts with other workshops
          </p>
        </div>
        <Link to="/marketplace/new" className="btn btn-primary">
          <Plus className="w-4 h-4 mr-2" />
          Create Listing
        </Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
            <input
              type="text"
              placeholder="Search listings..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-workshop-charcoal/40" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="input pl-10"
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Listings Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-workshop-charcoal/40">Loading...</div>
      ) : listings.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {listings.map((listing: any) => (
            <div key={listing.id} className="card p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-workshop-blue" />
                  <span className="badge badge-info">{listing.category}</span>
                </div>
                <span className="text-lg font-bold text-workshop-blue">
                  ${listing.price}
                </span>
              </div>

              <h3 className="font-semibold text-workshop-charcoal mb-2">{listing.title}</h3>
              <p className="text-sm text-workshop-charcoal/60 mb-4 line-clamp-2">
                {listing.description || 'No description'}
              </p>

              <div className="flex items-center gap-2 text-sm text-workshop-charcoal/60 mb-4">
                <Store className="w-4 h-4" />
                <span>{listing.tenant_name}</span>
              </div>

              {listing.tenant_address && (
                <div className="flex items-center gap-2 text-sm text-workshop-charcoal/60 mb-4">
                  <MapPin className="w-4 h-4" />
                  <span className="line-clamp-1">{listing.tenant_address}</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-workshop-charcoal/10">
                <div className="flex gap-2">
                  {listing.contact_phone && (
                    <a href={`tel:${listing.contact_phone}`} className="p-2 text-workshop-charcoal/40 hover:text-workshop-blue">
                      <Phone className="w-4 h-4" />
                    </a>
                  )}
                  {listing.contact_whatsapp && (
                    <a href={`https://wa.me/${listing.contact_whatsapp}`} target="_blank" rel="noopener noreferrer" className="p-2 text-workshop-charcoal/40 hover:text-green-600">
                      <MessageCircle className="w-4 h-4" />
                    </a>
                  )}
                  {listing.contact_email && (
                    <a href={`mailto:${listing.contact_email}`} className="p-2 text-workshop-charcoal/40 hover:text-workshop-blue">
                      <Mail className="w-4 h-4" />
                    </a>
                  )}
                </div>
                <span className="text-sm text-workshop-charcoal/40">
                  Qty: {listing.quantity_available}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-12 text-center">
          <Store className="w-12 h-12 text-workshop-charcoal/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-workshop-charcoal mb-2">No listings found</h3>
          <p className="text-workshop-charcoal/60 mb-4">
            {searchTerm || selectedCategory
              ? 'Try adjusting your search or filters'
              : 'Be the first to list a part for sale!'}
          </p>
          <Link to="/marketplace/new" className="btn btn-primary">
            <Plus className="w-4 h-4 mr-2" />
            Create Listing
          </Link>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="card p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Listing?</h3>
            <p className="text-workshop-charcoal/60 mb-6">
              This will remove the listing from the marketplace.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="btn btn-outline"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteConfirm)}
                className="btn btn-danger"
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
