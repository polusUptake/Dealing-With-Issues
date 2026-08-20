export type ReportPayload = {
  id: string
  title: string
  images: string[]
  location: {
    lat: number
    lng: number
  }
  createdAt: number
}

export type StoredReport = {
  id: string
  title: string
  imageUrls: string[]
  location: {
    lat: number
    lng: number
  }
  createdAt: number
  updatedAt: number
}
