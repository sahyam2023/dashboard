//src/services/api.ts
import { Document, Link, Patch, Software } from '../types';

const API_BASE_URL = 'http://127.0.0.1:5000';

export async function fetchSoftware(): Promise<Software[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/software`);
    if (!response.ok) {
      throw new Error(`Failed to fetch software: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching software:', error);
    throw error;
  }
}

export async function fetchLinks(softwareId?: number): Promise<Link[]> {
  try {
    const url = softwareId 
      ? `${API_BASE_URL}/api/links?software_id=${softwareId}` 
      : `${API_BASE_URL}/api/links`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch links: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching links:', error);
    throw error;
  }
}

export async function fetchDocuments(softwareId?: number): Promise<Document[]> {
  try {
    const url = softwareId 
      ? `${API_BASE_URL}/api/documents?software_id=${softwareId}` 
      : `${API_BASE_URL}/api/documents`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch documents: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching documents:', error);
    throw error;
  }
}

export async function fetchPatches(softwareId?: number): Promise<Patch[]> {
  try {
    const url = softwareId 
      ? `${API_BASE_URL}/api/patches?software_id=${softwareId}` 
      : `${API_BASE_URL}/api/patches`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch patches: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error fetching patches:', error);
    throw error;
  }
}

export async function searchData(query: string): Promise<any[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
    if (!response.ok) {
      throw new Error(`Failed to search: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Error searching:', error);
    throw error;
  }
}