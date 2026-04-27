fn main() {
    println!("{{PROJECT_NAME}} çalışıyor.");
}

#[cfg(test)]
mod tests {
    #[test]
    fn test_runs() {
        assert_eq!(2 + 2, 4);
    }
}
