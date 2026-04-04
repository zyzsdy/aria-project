use aria_model::{CursorPosition, TerminalSize};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TerminalSnapshotData {
    pub size: TerminalSize,
    pub visible_lines: Vec<String>,
    pub cursor: CursorPosition,
    pub alternate_screen: bool,
}

pub trait TerminalEngine: Send {
    fn process(&mut self, bytes: &[u8]);
    fn resize(&mut self, size: TerminalSize);
    fn snapshot(&self) -> TerminalSnapshotData;
    fn rehydrate(&self) -> Vec<u8>;
}

pub struct Vt100TerminalEngine {
    parser: vt100::Parser,
}

impl Vt100TerminalEngine {
    pub fn new(size: TerminalSize, scrollback_len: usize) -> Self {
        Self {
            parser: vt100::Parser::new(size.rows, size.cols, scrollback_len),
        }
    }
}

impl TerminalEngine for Vt100TerminalEngine {
    fn process(&mut self, bytes: &[u8]) {
        self.parser.process(bytes);
    }

    fn resize(&mut self, size: TerminalSize) {
        self.parser.screen_mut().set_size(size.rows, size.cols);
    }

    fn snapshot(&self) -> TerminalSnapshotData {
        let screen = self.parser.screen();
        let (rows, cols) = screen.size();
        let (row, col) = screen.cursor_position();

        TerminalSnapshotData {
            size: TerminalSize {
                cols,
                rows,
                pixel_width: 0,
                pixel_height: 0,
            },
            visible_lines: screen.rows(0, cols).collect(),
            cursor: CursorPosition { row, col },
            alternate_screen: screen.alternate_screen(),
        }
    }

    fn rehydrate(&self) -> Vec<u8> {
        let screen = self.parser.screen();
        let mut state = Vec::new();
        if screen.alternate_screen() {
            state.extend_from_slice(b"\x1b[?1049h");
        }
        state.extend_from_slice(&screen.state_formatted());
        state
    }
}

#[cfg(test)]
mod tests {
    use super::{TerminalEngine, Vt100TerminalEngine};
    use aria_model::TerminalSize;

    #[test]
    fn engine_tracks_basic_output() {
        let mut engine = Vt100TerminalEngine::new(TerminalSize::new(20, 4), 128);
        engine.process(b"hello\r\nworld");

        let snapshot = engine.snapshot();
        assert_eq!(snapshot.visible_lines[0].trim_end(), "hello");
        assert_eq!(snapshot.visible_lines[1].trim_end(), "world");
    }

    #[test]
    fn engine_respects_clear_screen() {
        let mut engine = Vt100TerminalEngine::new(TerminalSize::new(10, 3), 128);
        engine.process(b"abc");
        engine.process(b"\x1b[2J");

        let snapshot = engine.snapshot();
        assert!(snapshot
            .visible_lines
            .iter()
            .all(|line| line.trim().is_empty()));
    }

    #[test]
    fn rehydrate_rebuilds_primary_screen_contents() {
        let size = TerminalSize::new(20, 4);
        let mut source = Vt100TerminalEngine::new(size, 128);
        source.process(b"hello\r\nworld");

        let mut restored = Vt100TerminalEngine::new(size, 128);
        restored.process(&source.rehydrate());

        assert_eq!(restored.snapshot(), source.snapshot());
    }

    #[test]
    fn rehydrate_rebuilds_alternate_screen_contents() {
        let size = TerminalSize::new(20, 4);
        let mut source = Vt100TerminalEngine::new(size, 128);
        source.process(b"\x1b[?1049h");
        source.process(b"alt-screen");

        let mut restored = Vt100TerminalEngine::new(size, 128);
        restored.process(&source.rehydrate());

        assert_eq!(restored.snapshot(), source.snapshot());
        assert!(restored.snapshot().alternate_screen);
    }
}
