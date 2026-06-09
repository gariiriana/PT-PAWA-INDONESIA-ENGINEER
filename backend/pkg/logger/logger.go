package logger

import (
	"log"
	"os"
)

type Logger interface {
	Info(msg string, keysAndValues ...interface{})
	Error(msg string, err error, keysAndValues ...interface{})
}

type SimpleLogger struct {
	infoLog  *log.Logger
	errorLog *log.Logger
}

func NewSimpleLogger() *SimpleLogger {
	return &SimpleLogger{
		infoLog:  log.New(os.Stdout, "INFO: ", log.Ldate|log.Ltime|log.LUTC),
		errorLog: log.New(os.Stderr, "ERROR: ", log.Ldate|log.Ltime|log.LUTC),
	}
}

func (l *SimpleLogger) Info(msg string, keysAndValues ...interface{}) {
	l.infoLog.Println(msg, keysAndValues)
}

func (l *SimpleLogger) Error(msg string, err error, keysAndValues ...interface{}) {
	l.errorLog.Println(msg, err, keysAndValues)
}
