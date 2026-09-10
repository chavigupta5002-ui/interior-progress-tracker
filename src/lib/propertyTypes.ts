import type { PropertyType } from '../types'
import homestayIcon from '../assets/property-icons/homestay-icon.png'
import hotelIcon from '../assets/property-icons/hotel-icon.png'

export const PROPERTY_TYPES: { value: PropertyType; label: string; icon: string }[] = [
  { value: 'homestay', label: 'Homestay', icon: homestayIcon },
  { value: 'hotel', label: 'Hotel', icon: hotelIcon },
]

export const PROPERTY_TYPE_ICON: Record<PropertyType, string> = {
  homestay: homestayIcon,
  hotel: hotelIcon,
}

export const PROPERTY_TYPE_LABEL: Record<PropertyType, string> = {
  homestay: 'Homestay',
  hotel: 'Hotel',
}
