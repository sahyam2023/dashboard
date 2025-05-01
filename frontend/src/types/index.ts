//src/types/index.ts
export interface Software {
  id: number;
  name: string;
  description: string;
}

export interface Link {
  id: number;
  title: string;
  description: string;
  url: string;
  category: string;
  software_name: string;
}

export interface Document {
  id: number;
  doc_name: string;
  description: string;
  download_link: string;
  doc_type: string;
  software_name: string;
}

export interface Patch {
  id: number;
  patch_name: string;
  description: string;
  download_link: string;
  release_date: string;
  version_number: string;
  software_name: string;
  software_id: number;
}