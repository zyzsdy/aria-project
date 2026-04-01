use std::collections::VecDeque;

#[derive(Debug)]
pub struct ScrollbackBuffer {
    capacity: usize,
    lines: VecDeque<String>,
    partial: String,
    total_lines: usize,
}

impl ScrollbackBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity,
            lines: VecDeque::with_capacity(capacity.min(1024)),
            partial: String::new(),
            total_lines: 0,
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
        self.total_lines + usize::from(!self.partial.is_empty())
    }

    fn push_current_line(&mut self) {
        self.total_lines += 1;
        if self.lines.len() == self.capacity {
            self.lines.pop_front();
        }
        self.lines.push_back(std::mem::take(&mut self.partial));
    }
}

#[cfg(test)]
mod tests {
    use super::ScrollbackBuffer;

    #[test]
    fn buffer_counts_completed_and_partial_lines() {
        let mut buffer = ScrollbackBuffer::new(2);
        buffer.ingest(b"hello\nworld");
        assert_eq!(buffer.line_count(), 2);
        buffer.ingest(b"\nthird\n");
        assert_eq!(buffer.line_count(), 3);
    }
}
