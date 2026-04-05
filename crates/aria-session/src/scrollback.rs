use std::collections::VecDeque;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScrollbackLineEntry {
    pub line_id: u64,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScrollbackPage {
    pub first_available_line_id: Option<u64>,
    pub last_available_line_id: Option<u64>,
    pub has_more_above: bool,
    pub lines: Vec<ScrollbackLineEntry>,
}

#[derive(Debug)]
pub struct ScrollbackBuffer {
    capacity: usize,
    lines: VecDeque<ScrollbackLineEntry>,
    partial: String,
    next_line_id: u64,
}

impl ScrollbackBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            lines: VecDeque::with_capacity(capacity.min(1024)),
            partial: String::new(),
            next_line_id: 1,
        }
    }

    pub fn ingest(&mut self, bytes: &[u8]) {
        for ch in String::from_utf8_lossy(bytes).chars() {
            match ch {
                '\n' => self.push_current_line(),
                '\r' => {}
                _ => self.partial.push(ch),
            }
        }
    }

    pub fn line_count(&self) -> usize {
        self.completed_line_count() + usize::from(!self.partial.is_empty())
    }

    pub fn read(&self, before_line_id: Option<u64>, limit: usize) -> ScrollbackPage {
        let mut available = self.lines.iter().cloned().collect::<Vec<_>>();
        if !self.partial.is_empty() {
            available.push(ScrollbackLineEntry {
                line_id: self.next_line_id,
                text: self.partial.clone(),
            });
        }

        let first_available_line_id = available.first().map(|line| line.line_id);
        let last_available_line_id = available.last().map(|line| line.line_id);

        let filtered = match before_line_id {
            Some(before) => available
                .into_iter()
                .filter(|line| line.line_id < before)
                .collect::<Vec<_>>(),
            None => available,
        };

        let len = filtered.len();
        let start = len.saturating_sub(limit);
        let lines = filtered[start..].to_vec();
        let has_more_above = start > 0;

        ScrollbackPage {
            first_available_line_id,
            last_available_line_id,
            has_more_above,
            lines,
        }
    }

    pub fn recent_completed_lines(&self, limit: usize) -> Vec<ScrollbackLineEntry> {
        let len = self.lines.len();
        let start = len.saturating_sub(limit);
        self.lines.iter().skip(start).cloned().collect()
    }

    fn completed_line_count(&self) -> usize {
        self.next_line_id.saturating_sub(1) as usize
    }

    fn push_current_line(&mut self) {
        let line = ScrollbackLineEntry {
            line_id: self.next_line_id,
            text: std::mem::take(&mut self.partial),
        };
        self.next_line_id += 1;

        if self.lines.len() == self.capacity {
            self.lines.pop_front();
        }

        self.lines.push_back(line);
    }
}

#[cfg(test)]
mod tests {
    use super::{ScrollbackBuffer, ScrollbackLineEntry};

    #[test]
    fn buffer_counts_completed_and_partial_lines() {
        let mut buffer = ScrollbackBuffer::new(2);
        buffer.ingest(b"hello\nworld");
        assert_eq!(buffer.line_count(), 2);
        buffer.ingest(b"\nthird\n");
        assert_eq!(buffer.line_count(), 3);
    }

    #[test]
    fn read_returns_latest_lines_with_stable_ids() {
        let mut buffer = ScrollbackBuffer::new(5);
        buffer.ingest(b"one\ntwo\nthree");

        let page = buffer.read(None, 2);

        assert_eq!(page.first_available_line_id, Some(1));
        assert_eq!(page.last_available_line_id, Some(3));
        assert_eq!(
            page.lines,
            vec![
                ScrollbackLineEntry {
                    line_id: 2,
                    text: "two".to_string(),
                },
                ScrollbackLineEntry {
                    line_id: 3,
                    text: "three".to_string(),
                },
            ]
        );
    }

    #[test]
    fn read_before_pages_backwards() {
        let mut buffer = ScrollbackBuffer::new(5);
        buffer.ingest(b"one\ntwo\nthree\nfour\n");

        let page = buffer.read(Some(4), 2);

        assert!(page.has_more_above);
        assert_eq!(
            page.lines,
            vec![
                ScrollbackLineEntry {
                    line_id: 2,
                    text: "two".to_string(),
                },
                ScrollbackLineEntry {
                    line_id: 3,
                    text: "three".to_string(),
                },
            ]
        );
    }

    #[test]
    fn recent_completed_lines_omits_partial_tail() {
        let mut buffer = ScrollbackBuffer::new(5);
        buffer.ingest(b"one\ntwo\nthree");

        let lines = buffer.recent_completed_lines(3);

        assert_eq!(
            lines,
            vec![
                ScrollbackLineEntry {
                    line_id: 1,
                    text: "one".to_string(),
                },
                ScrollbackLineEntry {
                    line_id: 2,
                    text: "two".to_string(),
                },
            ]
        );
    }
}
