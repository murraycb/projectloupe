//! Thread-safe LRU cache with byte budget management
//!
//! This module provides a generic LRU cache that tracks both the number of items
//! and the total bytes stored, evicting least-recently-used items when the byte
//! budget is exceeded.

use parking_lot::Mutex;
use std::collections::HashMap;
use std::fmt;
use std::hash::Hash;

/// A simplified thread-safe LRU cache with byte budget management
///
/// This cache tracks the total bytes of stored values and evicts the least recently
/// used items when the budget is exceeded. All operations are thread-safe.
pub struct LruCache<K, V> {
    inner: Mutex<LruCacheInner<K, V>>,
}

struct LruCacheInner<K, V> {
    data: HashMap<K, (V, usize, u64)>, // value, byte_size, access_time
    total_bytes: usize,
    max_bytes: usize,
    access_counter: u64,
}

impl<K: Clone + Hash + Eq, V: Clone> LruCache<K, V> {
    /// Create a new LRU cache with the specified byte budget
    pub fn new(max_bytes: usize) -> Self {
        Self {
            inner: Mutex::new(LruCacheInner {
                data: HashMap::new(),
                total_bytes: 0,
                max_bytes,
                access_counter: 0,
            }),
        }
    }

    /// Get a value from the cache, updating its position to most recently used
    pub fn get<Q>(&self, key: &Q) -> Option<V>
    where
        K: std::borrow::Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        let mut inner = self.inner.lock();
        inner.get(key)
    }

    /// Insert a value into the cache, evicting old items if necessary
    pub fn insert(&self, key: K, value: V, byte_size: usize) {
        let mut inner = self.inner.lock();
        inner.insert(key, value, byte_size);
    }

    /// Get the current total bytes stored in the cache
    pub fn total_bytes(&self) -> usize {
        self.inner.lock().total_bytes
    }

    /// Get the maximum byte budget
    pub fn max_bytes(&self) -> usize {
        self.inner.lock().max_bytes
    }

    /// Get the number of items in the cache
    pub fn len(&self) -> usize {
        self.inner.lock().data.len()
    }

    /// Check if the cache is empty
    pub fn is_empty(&self) -> bool {
        self.len() == 0
    }

    /// Clear all items from the cache
    pub fn clear(&self) {
        let mut inner = self.inner.lock();
        inner.clear();
    }
}

impl<K: Clone + Hash + Eq, V: Clone> LruCacheInner<K, V> {
    fn get<Q>(&mut self, key: &Q) -> Option<V>
    where
        K: std::borrow::Borrow<Q>,
        Q: Hash + Eq + ?Sized,
    {
        if let Some((value, byte_size, _)) = self.data.get(key) {
            let value = value.clone();
            let byte_size = *byte_size;
            
            // Update access time
            self.access_counter += 1;
            if let Some(entry) = self.data.get_mut(key) {
                entry.2 = self.access_counter;
            }
            
            Some(value)
        } else {
            None
        }
    }

    fn insert(&mut self, key: K, value: V, byte_size: usize) {
        self.access_counter += 1;
        
        // Check if key already exists
        if let Some((_, old_byte_size, _)) = self.data.get(&key) {
            self.total_bytes = self.total_bytes
                .saturating_sub(*old_byte_size)
                .saturating_add(byte_size);
        } else {
            self.total_bytes = self.total_bytes.saturating_add(byte_size);
        }
        
        self.data.insert(key, (value, byte_size, self.access_counter));

        // Evict items if over budget
        while self.total_bytes > self.max_bytes && !self.data.is_empty() {
            self.evict_lru();
        }
    }

    fn evict_lru(&mut self) {
        if self.data.is_empty() {
            return;
        }

        // Find the item with the oldest access time
        let mut oldest_key = None;
        let mut oldest_time = u64::MAX;
        
        for (key, (_, _, access_time)) in &self.data {
            if *access_time < oldest_time {
                oldest_time = *access_time;
                oldest_key = Some(key.clone());
            }
        }
        
        if let Some(key) = oldest_key {
            if let Some((_, byte_size, _)) = self.data.remove(&key) {
                self.total_bytes = self.total_bytes.saturating_sub(byte_size);
            }
        }
    }

    fn clear(&mut self) {
        self.data.clear();
        self.total_bytes = 0;
        self.access_counter = 0;
    }
}

impl<K: fmt::Debug, V> fmt::Debug for LruCache<K, V> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let inner = self.inner.lock();
        f.debug_struct("LruCache")
            .field("len", &inner.data.len())
            .field("total_bytes", &inner.total_bytes)
            .field("max_bytes", &inner.max_bytes)
            .finish()
    }
}

// Implement Send and Sync explicitly
unsafe impl<K: Send, V: Send> Send for LruCache<K, V> {}
unsafe impl<K: Send, V: Send> Sync for LruCache<K, V> {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_operations() {
        let cache = LruCache::new(100);

        // Test insertion and retrieval
        cache.insert("key1".to_string(), vec![1, 2, 3], 10);
        assert_eq!(cache.get("key1"), Some(vec![1, 2, 3]));
        assert_eq!(cache.len(), 1);
        assert_eq!(cache.total_bytes(), 10);

        // Test non-existent key
        assert_eq!(cache.get("key2"), None);
    }

    #[test]
    fn test_lru_eviction() {
        let cache = LruCache::new(25);

        // Insert items that fit within budget
        cache.insert("key1".to_string(), vec![1], 10);
        cache.insert("key2".to_string(), vec![2], 10);
        
        // This should fit (total = 25)
        cache.insert("key3".to_string(), vec![3], 5);
        assert_eq!(cache.len(), 3);
        assert_eq!(cache.total_bytes(), 25);

        // This should evict key1 (oldest)
        cache.insert("key4".to_string(), vec![4], 10);
        assert_eq!(cache.get("key1"), None);
        assert_eq!(cache.get("key2"), Some(vec![2]));
        assert_eq!(cache.get("key3"), Some(vec![3]));
        assert_eq!(cache.get("key4"), Some(vec![4]));
        assert!(cache.total_bytes() <= 25);
    }

    #[test]
    fn test_lru_ordering() {
        let cache = LruCache::new(25);

        // Insert three items
        cache.insert("key1".to_string(), vec![1], 5);
        cache.insert("key2".to_string(), vec![2], 5);
        cache.insert("key3".to_string(), vec![3], 5);

        // Access key1 to make it most recently used
        cache.get("key1");

        // Insert a large item that should evict key2 (now the LRU)
        cache.insert("key4".to_string(), vec![4], 15);
        
        assert_eq!(cache.get("key1"), Some(vec![1])); // Should still be there
        assert_eq!(cache.get("key2"), None);          // Should be evicted
        assert_eq!(cache.get("key3"), Some(vec![3])); // Should still be there
        assert_eq!(cache.get("key4"), Some(vec![4])); // Should be there
    }

    #[test]
    fn test_update_existing_key() {
        let cache = LruCache::new(50);

        cache.insert("key1".to_string(), vec![1, 2, 3], 10);
        assert_eq!(cache.total_bytes(), 10);

        // Update with larger value
        cache.insert("key1".to_string(), vec![1, 2, 3, 4, 5], 20);
        assert_eq!(cache.total_bytes(), 20);
        assert_eq!(cache.get("key1"), Some(vec![1, 2, 3, 4, 5]));
        assert_eq!(cache.len(), 1);

        // Update with smaller value
        cache.insert("key1".to_string(), vec![1], 5);
        assert_eq!(cache.total_bytes(), 5);
        assert_eq!(cache.get("key1"), Some(vec![1]));
    }

    #[test]
    fn test_clear() {
        let cache = LruCache::new(100);
        
        cache.insert("key1".to_string(), vec![1, 2, 3], 10);
        cache.insert("key2".to_string(), vec![4, 5, 6], 15);
        
        assert_eq!(cache.len(), 2);
        assert_eq!(cache.total_bytes(), 25);
        
        cache.clear();
        
        assert_eq!(cache.len(), 0);
        assert_eq!(cache.total_bytes(), 0);
        assert!(cache.is_empty());
    }
}