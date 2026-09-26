import streamlit as st
from textblob import TextBlob

def analyze_sentiment(text):
    blob = TextBlob(text)
    polarity = blob.sentiment.polarity
    subjectivity = blob.sentiment.subjectivity
    
    if polarity > 0:
        sentiment = "Positive"
    elif polarity < 0:
        sentiment = "Negative"
    else:
        sentiment = "Neutral"
        
    return sentiment, polarity, subjectivity

st.title("Sentiment Analyzer")

user_input = st.text_area("Enter Text:")

if st.button("Analyze"):
    if user_input.strip():
        sentiment, polarity, subjectivity = analyze_sentiment(user_input)
        
        st.write("### Analysis Results")
        st.write(f"**Sentiment:** {sentiment}")
        st.write(f"**Polarity:** {polarity}")
        st.write(f"**Subjectivity:** {subjectivity}")
    else:
        st.write("Please enter text to analyze.")