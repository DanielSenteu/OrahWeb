export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => {
      const result = reader.result as string
      // Remove the data:image/xxx;base64, prefix
      const base64 = result.split(',')[1]
      resolve(base64)
    }
    reader.onerror = (error) => reject(error)
  })
}

export function getFileType(file: File): 'image' | 'pdf' | 'unsupported' {
  const imageTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp']
  
  if (imageTypes.includes(file.type)) {
    return 'image'
  }
  
  if (file.type === 'application/pdf') {
    return 'pdf'
  }
  
  return 'unsupported'
}



